import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { PoolClient } from "pg";
import { ActorRequest } from "./auth";
import { Database, audit } from "./db";
import { PlanningService, accessSql } from "./planning.service";
import { PlanningClock, localDate, addDays } from "./planning-clock";
import { MovementsService } from "./movements.service";
import { finalReview, criticalClosureAlerts } from "./trip-closure";
import { syncPassengerAlerts } from "./alerts-domain";
import { invalidateAccounting } from "./history-domain";
type Tx = Pick<PoolClient, "query">;
export type CreateTrip = {
  id: string;
  date: string;
  direction: "OUTBOUND" | "RETURN";
  driverId: string;
  vehicleId: string;
  planIds: string[];
  exceptionReason?: string;
};
// A escola e a família enxergam somente suas próprias participações, inclusive nos totais.
const passengerAccess = `(($2='DRIVER' AND t.transport_id=$1) OR (l.status='ACTIVE' AND (($2='SCHOOL' AND p.school_id=$1) OR ($2='GUARDIAN' AND EXISTS(SELECT 1 FROM guardian_links g WHERE g.student_id=p.student_id AND g.user_id=$3 AND g.status='ACTIVE')))))`;
@Injectable()
export class TripsService {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(PlanningService) private planning: PlanningService,
    @Inject(PlanningClock) private clock: PlanningClock,
    @Inject(MovementsService) private movements: MovementsService,
  ) {}
  driver(req: ActorRequest) {
    if (req.context!.role !== "DRIVER")
      throw new ForbiddenException(
        "Somente o transporte prepara e altera viagens.",
      );
    return req.context!;
  }
  async write<T>(req: ActorRequest, fn: (db: PoolClient) => Promise<T>) {
    const c = this.driver(req);
    return this.db.transaction(async (db) => {
      // Ordem das reservas: operação, viagem, crianças ordenadas, vínculos e previsões.
      await db.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
        c.organization_id,
      ]);
      return fn(db);
    });
  }
  async mutable(
    req: ActorRequest,
    id: string,
    version: number,
    db: Tx,
    accounting = false,
  ) {
    const t = (
      await db.query(
        "SELECT *,service_date::text service_date FROM trips WHERE id=$1 AND transport_id=$2 FOR UPDATE",
        [id, req.context!.organization_id],
      )
    ).rows[0];
    if (!t)
      throw new NotFoundException("Viagem não disponível neste contexto.");
    if (t.version !== version)
      throw new ConflictException(
        "A viagem mudou. Atualize antes de continuar.",
      );
    if (
      !(
        accounting
          ? ["PLANNED", "IN_PROGRESS", "ROUTE_ENDED_OPEN", "COMPLETED_REVIEW"]
          : ["PLANNED", "IN_PROGRESS"]
      ).includes(t.status)
    )
      throw new ConflictException("Esta viagem não permite novas alterações.");
    if (
      t.service_date < localDate(this.clock.now(), t.timezone) &&
      !(accounting && t.status !== "PLANNED")
    )
      throw new ConflictException(
        "Viagem de data passada é somente para consulta.",
      );
    return t;
  }
  async assignment(
    req: ActorRequest,
    driverId: string,
    vehicleId: string,
    db: Tx,
  ) {
    const c = this.driver(req);
    const driver = (
      await db.query(
        "SELECT m.id,m.user_id,u.name FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.id=$1 AND m.organization_id=$2 AND m.role='DRIVER' AND m.active=true FOR UPDATE OF m,u",
        [driverId, c.organization_id],
      )
    ).rows[0];
    const vehicle = (
      await db.query(
        "SELECT * FROM vehicles WHERE id=$1 AND organization_id=$2 AND active=true FOR UPDATE",
        [vehicleId, c.organization_id],
      )
    ).rows[0];
    if (!driver || !vehicle)
      throw new BadRequestException(
        "Escolha motorista e veículo ativos da própria operação.",
      );
    return { driver, vehicle };
  }
  async available(req: ActorRequest, date: string, direction: string) {
    const plans = (
      await this.db.pool.query(
        `SELECT p.id,p.status,p.scheduled,p.locked_at,l.id link_id,l.student_id,s.name student_name,sc.name school_name,l.school_id,
      a.trip_id,EXISTS(SELECT 1 FROM planning_changes c WHERE c.plan_id=p.id AND c.status='PENDING') pending_change
      FROM daily_plans p JOIN operating_links l ON l.id=p.operating_link_id JOIN students s ON s.id=l.student_id JOIN organizations sc ON sc.id=l.school_id
      LEFT JOIN trip_passengers a ON a.plan_id=p.id AND a.active WHERE ${accessSql} AND p.service_date=$4 AND p.direction=$5 ORDER BY s.name,l.id`,
        [...this.planning.params(req), date, direction],
      )
    ).rows;
    const isDriver = req.context!.role === "DRIVER";
    return {
      plans,
      drivers: isDriver
        ? (
            await this.db.pool.query(
              "SELECT m.id,u.name FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=$1 AND m.role='DRIVER' AND m.active ORDER BY u.name",
              [req.context!.organization_id],
            )
          ).rows
        : [],
      vehicles: isDriver
        ? (
            await this.db.pool.query(
              "SELECT id,name,plate,capacity FROM vehicles WHERE organization_id=$1 AND active ORDER BY name",
              [req.context!.organization_id],
            )
          ).rows
        : [],
    };
  }
  async list(req: ActorRequest, date: string) {
    const rows = (
      await this.db.pool.query(
        `SELECT t.*,t.service_date::text service_date FROM trips t WHERE t.service_date=$4 AND (($2='DRIVER' AND t.transport_id=$1) OR EXISTS(SELECT 1 FROM trip_passengers p JOIN operating_links l ON l.id=p.operating_link_id WHERE p.trip_id=t.id AND ${passengerAccess})) ORDER BY t.direction,t.created_at,t.id`,
        [...this.planning.params(req), date],
      )
    ).rows;
    return {
      date,
      trips: await Promise.all(rows.map((t) => this.detail(req, t.id))),
    };
  }
  async detail(req: ActorRequest, id: string) {
    const t = (
      await this.db.pool.query(
        `SELECT t.*,t.service_date::text service_date FROM trips t WHERE t.id=$4 AND (($2='DRIVER' AND t.transport_id=$1) OR EXISTS(SELECT 1 FROM trip_passengers p JOIN operating_links l ON l.id=p.operating_link_id WHERE p.trip_id=t.id AND ${passengerAccess}))`,
        [...this.planning.params(req), id],
      )
    ).rows[0];
    if (!t)
      throw new NotFoundException("Viagem não disponível neste contexto.");
    const passengers = (
      await this.db.pool.query(
        `SELECT p.*,l.status link_status FROM trip_passengers p JOIN trips t ON t.id=p.trip_id JOIN operating_links l ON l.id=p.operating_link_id WHERE p.trip_id=$4 AND ${passengerAccess} ORDER BY p.student_name,p.id`,
        [...this.planning.params(req), id],
      )
    ).rows;
    const assignments = (
      await this.db.pool.query(
        "SELECT a.*,u.name actor_name FROM trip_assignments a JOIN users u ON u.id=a.actor_id WHERE trip_id=$1 ORDER BY a.created_at,a.id",
        [id],
      )
    ).rows;
    // creation_hash contém apenas a chave técnica de idempotência; não faz parte da interface.
    const { creation_hash, ...trip } = t;
    const enriched = await this.movements.summaries(req, t, passengers);
    return {
      ...trip,
      today: localDate(this.clock.now(), t.timezone),
      passengers: enriched,
      assignments,
      closure: {
        ...(await finalReview(
          this.db.pool,
          id,
          passengers.map((p) => p.id),
        )),
        canInspect:
          req.context!.role === "DRIVER" &&
          req.context!.id === t.driver_membership_id &&
          req.actor.id === t.driver_user_id &&
          ["IN_PROGRESS", "ROUTE_ENDED_OPEN", "COMPLETED_REVIEW"].includes(
            t.status,
          ),
        inspections: (
          await this.db.pool.query(
            `SELECT id,actor_name,inspected_at,van_empty,result,trip_version${req.context!.role === "DRIVER" ? ",note" : ""} FROM trip_inspections WHERE trip_id=$1 ORDER BY trip_version DESC`,
            [id],
          )
        ).rows,
      },
      counts: {
        total: passengers.length,
        expected: passengers.filter((p) => p.disposition === "EXPECTED").length,
        review: passengers.filter((p) => p.disposition === "REVIEW_REQUIRED")
          .length,
        notTransported: passengers.filter(
          (p) => p.disposition === "NOT_TRANSPORTED",
        ).length,
        boardingInformed: enriched.filter(
          (p) => p.movements[0].state === "INFORMED",
        ).length,
        boardingValidated: enriched.filter(
          (p) => p.movements[0].state === "VALIDATED",
        ).length,
        pendingDelivery: enriched.filter(
          (p) =>
            (!p.exceptionalResolution &&
              (p.boarding_informed_at || p.alighting_informed_at) &&
              p.movements[1].state !== "VALIDATED") ||
            p.deliveryUnderReview,
        ).length,
        delivered: enriched.filter(
          (p) =>
            !p.exceptionalResolution && p.movements[1].state === "VALIDATED",
        ).length,
        openIssues: enriched.reduce(
          (sum, p) =>
            sum +
            p.issues.filter((i: { status: string }) => i.status !== "RESOLVED")
              .length +
            p.alerts.filter((a: any) => a.kind !== "SEQUENCE_INCOMPLETE")
              .length,
          0,
        ),
        unaccounted: enriched.filter(
          (p) =>
            (!p.exceptionalResolution &&
              p.disposition !== "NOT_TRANSPORTED" &&
              p.movements[1].state !== "VALIDATED") ||
            p.deliveryUnderReview,
        ).length,
      },
    };
  }
  async insertPassenger(
    req: ActorRequest,
    t: any,
    planId: string,
    db: Tx,
    exceptionReason?: string,
    initial = false,
  ) {
    await db.query(
      "SELECT s.id FROM students s JOIN operating_links l ON l.student_id=s.id JOIN daily_plans p ON p.operating_link_id=l.id WHERE p.id=$1 FOR UPDATE OF s",
      [planId],
    );
    const { plan: p, link: l } = await this.planning.plan(
      req,
      planId,
      db,
      true,
    );
    if (initial && p.status !== "NOT_EXPECTED") exceptionReason = undefined;
    if (
      l.transport_id !== t.transport_id ||
      p.service_date !== t.service_date ||
      p.direction !== t.direction
    )
      throw new BadRequestException(
        "A previsão deve pertencer à data, trecho e transporte da viagem.",
      );
    if (
      p.locked_at ||
      (
        await db.query(
          "SELECT id FROM trip_passengers WHERE plan_id=$1 AND active",
          [planId],
        )
      ).rows[0]
    )
      throw new ConflictException(
        "Este trecho já está reservado ou bloqueado pela operação.",
      );
    if (
      (
        await db.query(
          "SELECT p.id FROM trip_passengers p JOIN trips tr ON tr.id=p.trip_id WHERE p.student_id=$1 AND p.active AND tr.service_date=$2 AND tr.direction=$3",
          [l.student_id, t.service_date, t.direction],
        )
      ).rows[0]
    )
      throw new ConflictException(
        "Esta criança já possui uma viagem reservada para a mesma data e trecho.",
      );
    if (
      (
        await db.query(
          "SELECT id FROM planning_changes WHERE plan_id=$1 AND status='PENDING'",
          [planId],
        )
      ).rows[0]
    )
      throw new ConflictException(
        "Decida a alteração de planejamento antes de incluir este trecho.",
      );
    if (p.status === "NOT_EXPECTED" && !exceptionReason)
      throw new BadRequestException(
        "Aluno sem previsão exige inclusão excepcional com motivo.",
      );
    const disposition = exceptionReason
      ? "EXPECTED"
      : p.status === "CONFIRMED"
        ? "EXPECTED"
        : p.status === "NOT_USING"
          ? "NOT_TRANSPORTED"
          : "REVIEW_REQUIRED";
    const id = randomUUID();
    await db.query(
      `INSERT INTO trip_passengers(id,trip_id,plan_id,operating_link_id,student_id,school_id,student_name,school_name,planning_status,scheduled,disposition,reason,exceptional,added_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        id,
        t.id,
        planId,
        l.id,
        l.student_id,
        l.school_id,
        l.student_name,
        l.school_name,
        p.status,
        p.scheduled,
        disposition,
        exceptionReason ||
          (p.status === "NOT_USING"
            ? "Não uso expresso no planejamento."
            : null),
        Boolean(exceptionReason),
        req.actor.id,
      ],
    );
    await db.query(
      "UPDATE daily_plans SET locked_at=$2,version=version+1 WHERE id=$1",
      [planId, this.clock.now()],
    );
    await audit(
      db,
      req.actor.id,
      exceptionReason ? "TRIP_EXCEPTION_ADDED" : "TRIP_PASSENGER_ALLOCATED",
      id,
      req.context,
      {
        tripId: t.id,
        planId,
        planningStatus: p.status,
        disposition,
        reason: exceptionReason,
      },
    );
  }
  async capacity(t: any, db: Tx) {
    const n = (
      await db.query(
        "SELECT count(*)::int n FROM trip_passengers WHERE trip_id=$1 AND disposition<>'NOT_TRANSPORTED'",
        [t.id],
      )
    ).rows[0].n;
    if (n > t.capacity)
      throw new ConflictException(
        "A quantidade de passageiros excede a capacidade do veículo.",
      );
  }
  async create(req: ActorRequest, input: CreateTrip) {
    const c = this.driver(req);
    const hash = createHash("sha256")
      .update(JSON.stringify({ ...input, planIds: [...input.planIds].sort() }))
      .digest("hex");
    return this.write(req, async (db) => {
      const existing = (
        await db.query(
          "SELECT transport_id,creation_hash FROM trips WHERE id=$1",
          [input.id],
        )
      ).rows[0];
      if (existing) {
        if (
          existing.transport_id !== c.organization_id ||
          existing.creation_hash !== hash
        )
          throw new ConflictException(
            "A chave desta preparação já foi usada. Atualize e prepare uma nova viagem.",
          );
        return { id: input.id, unchanged: true };
      }
      const policy = (
        await db.query(
          "SELECT timezone FROM planning_policies WHERE transport_id=$1",
          [c.organization_id],
        )
      ).rows[0];
      if (!policy)
        throw new BadRequestException(
          "Configure o limite e o fuso da operação no Planejamento.",
        );
      const today = localDate(this.clock.now(), policy.timezone);
      if (input.date < today || input.date > addDays(today, 30))
        throw new BadRequestException(
          "Prepare viagens de hoje até os próximos 30 dias.",
        );
      const { driver, vehicle } = await this.assignment(
        req,
        input.driverId,
        input.vehicleId,
        db,
      );
      await db.query(
        `INSERT INTO trips(id,transport_id,service_date,direction,timezone,driver_membership_id,driver_user_id,driver_name,vehicle_id,vehicle_name,vehicle_plate,capacity,creation_hash,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          input.id,
          c.organization_id,
          input.date,
          input.direction,
          policy.timezone,
          driver.id,
          driver.user_id,
          driver.name,
          vehicle.id,
          vehicle.name,
          vehicle.plate,
          vehicle.capacity,
          hash,
          req.actor.id,
        ],
      );
      const t = {
        id: input.id,
        transport_id: c.organization_id,
        service_date: input.date,
        direction: input.direction,
        capacity: vehicle.capacity,
      };
      await db.query(
        "SELECT s.id FROM students s WHERE s.id IN (SELECT l.student_id FROM operating_links l JOIN daily_plans p ON p.operating_link_id=l.id WHERE p.id=ANY($1::uuid[])) ORDER BY s.id FOR UPDATE",
        [input.planIds],
      );
      // Vínculos em ordem estável evitam deadlock com geração/alterações de planejamento.
      const ordered = (
        await db.query(
          "SELECT id FROM daily_plans WHERE id=ANY($1::uuid[]) ORDER BY operating_link_id,id",
          [input.planIds],
        )
      ).rows;
      if (ordered.length !== input.planIds.length)
        throw new NotFoundException("Há uma previsão indisponível.");
      for (const p of ordered)
        await this.insertPassenger(
          req,
          t,
          p.id,
          db,
          input.exceptionReason,
          true,
        );
      await this.capacity(t, db);
      await this.recordAssignment(
        req,
        t.id,
        null,
        null,
        driver,
        vehicle,
        "Preparação inicial da viagem.",
        db,
      );
      await audit(db, req.actor.id, "TRIP_CREATED", t.id, c, {
        date: input.date,
        direction: input.direction,
        planIds: input.planIds,
      });
      return { id: t.id };
    });
  }
  async recordAssignment(
    req: ActorRequest,
    id: string,
    previousDriver: string | null,
    previousVehicle: string | null,
    driver: any,
    vehicle: any,
    reason: string,
    db: Tx,
  ) {
    const assignmentId = randomUUID();
    await db.query(
      "INSERT INTO trip_assignments(id,trip_id,previous_driver_membership_id,driver_membership_id,previous_vehicle_id,vehicle_id,driver_name,vehicle_name,vehicle_plate,reason,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
      [
        assignmentId,
        id,
        previousDriver,
        driver.id,
        previousVehicle,
        vehicle.id,
        driver.name,
        vehicle.name,
        vehicle.plate,
        reason,
        req.actor.id,
      ],
    );
    await db.query("UPDATE trips SET current_assignment_id=$2 WHERE id=$1", [
      id,
      assignmentId,
    ]);
  }
  async freeAssignment(t: any, db: Tx) {
    const other = (
      await db.query(
        "SELECT id FROM trips WHERE id<>$1 AND status IN ('IN_PROGRESS','ROUTE_ENDED_OPEN') AND (driver_user_id=$2 OR vehicle_id=$3)",
        [t.id, t.driver_user_id, t.vehicle_id],
      )
    ).rows[0];
    if (other)
      throw new ConflictException(
        "Motorista ou veículo possui outra viagem em andamento ou com encerramento pendente.",
      );
  }
  async start(req: ActorRequest, id: string, version: number) {
    return this.write(req, async (db) => {
      const t = await this.mutable(req, id, version, db);
      if (t.status !== "PLANNED")
        throw new ConflictException(
          "A viagem já foi iniciada. Atualize a situação.",
        );
      if (t.driver_user_id !== req.actor.id)
        throw new ForbiddenException(
          "Somente o motorista designado inicia a viagem.",
        );
      if (t.service_date !== localDate(this.clock.now(), t.timezone))
        throw new ConflictException(
          "Inicie a viagem somente na sua data de operação.",
        );
      const { vehicle } = await this.assignment(
        req,
        t.driver_membership_id,
        t.vehicle_id,
        db,
      );
      const passengers = (
        await db.query(
          "SELECT * FROM trip_passengers WHERE trip_id=$1 ORDER BY operating_link_id,plan_id",
          [id],
        )
      ).rows;
      for (const p of passengers)
        await this.planning.plan(req, p.plan_id, db, true);
      if (passengers.some((p) => p.disposition === "REVIEW_REQUIRED"))
        throw new ConflictException(
          "Defina a destinação dos passageiros que aguardam revisão.",
        );
      if (!passengers.some((p) => p.disposition === "EXPECTED"))
        throw new ConflictException(
          "Não há passageiro a transportar. Cancele a viagem planejada se necessário.",
        );
      await this.capacity(
        { ...t, capacity: Math.min(t.capacity, vehicle.capacity) },
        db,
      );
      await this.freeAssignment(t, db);
      await db.query(
        "UPDATE trips SET status='IN_PROGRESS',started_by=$2,started_at=$3,version=version+1 WHERE id=$1",
        [id, req.actor.id, this.clock.now()],
      );
      await audit(db, req.actor.id, "TRIP_STARTED", id, req.context, {
        driverId: t.driver_membership_id,
        vehicleId: t.vehicle_id,
      });
      return { id };
    });
  }
  async disposition(
    req: ActorRequest,
    id: string,
    passengerId: string,
    input: {
      expectedVersion: number;
      disposition: "EXPECTED" | "NOT_TRANSPORTED";
      reason: string;
    },
  ) {
    return this.write(req, async (db) => {
      const t = await this.mutable(
        req,
        id,
        input.expectedVersion,
        db,
        input.disposition === "NOT_TRANSPORTED",
      );
      if (
        t.status !== "PLANNED" &&
        (t.driver_user_id !== req.actor.id ||
          t.driver_membership_id !== req.context!.id)
      )
        throw new ForbiddenException(
          "Somente o motorista designado altera passageiros em andamento.",
        );
      const p = (
        await db.query(
          "SELECT * FROM trip_passengers WHERE trip_id=$1 AND id=$2 FOR UPDATE",
          [id, passengerId],
        )
      ).rows[0];
      if (!p)
        throw new NotFoundException("Passageiro não disponível nesta viagem.");
      await this.planning.plan(req, p.plan_id, db, true);
      if (p.boarding_informed_at || p.alighting_informed_at)
        throw new ConflictException(
          "Há movimentação informada. A ausência não pode retirar esta criança da viagem; trate a movimentação ou ocorrência.",
        );
      await db.query(
        "UPDATE trip_passengers SET disposition=$2,reason=$3,exceptional=exceptional OR ($2='EXPECTED' AND planning_status<>'CONFIRMED'),changed_by=$4,changed_at=now() WHERE id=$1",
        [p.id, input.disposition, input.reason, req.actor.id],
      );
      await this.capacity(t, db);
      await db.query("UPDATE trips SET version=version+1 WHERE id=$1", [id]);
      await invalidateAccounting(db, p.id);
      await syncPassengerAlerts(db, p.id, this.clock.now());
      await audit(
        db,
        req.actor.id,
        "TRIP_PASSENGER_DISPOSITION",
        p.id,
        req.context,
        {
          tripId: id,
          previous: p.disposition,
          disposition: input.disposition,
          reason: input.reason,
        },
      );
      return { id };
    });
  }
  async close(
    req: ActorRequest,
    id: string,
    input: {
      id: string;
      expectedVersion: number;
      walkedInterior: true;
      checkedSeats: true;
      checkedHidingPlaces: true;
      vanEmpty: boolean;
      note?: string;
    },
  ) {
    return this.write(req, async (db) => {
      const t = (
        await db.query(
          "SELECT *,service_date::text service_date FROM trips WHERE id=$1 AND transport_id=$2 FOR UPDATE",
          [id, req.context!.organization_id],
        )
      ).rows[0];
      if (!t)
        throw new NotFoundException("Viagem não disponível neste contexto.");
      const member = (
        await db.query(
          "SELECT id FROM memberships WHERE id=$1 AND user_id=$2 AND active AND role='DRIVER' AND organization_id=$3 FOR UPDATE",
          [req.context!.id, req.actor.id, t.transport_id],
        )
      ).rows[0];
      if (
        !member ||
        t.driver_membership_id !== member.id ||
        t.driver_user_id !== req.actor.id
      )
        throw new ForbiddenException(
          "Somente o motorista designado registra a conferência final.",
        );
      const hash = createHash("sha256")
        .update(JSON.stringify({ tripId: id, actorId: req.actor.id, ...input }))
        .digest("hex");
      const existing = (
        await db.query(
          "SELECT trip_id,request_hash,result FROM trip_inspections WHERE id=$1",
          [input.id],
        )
      ).rows[0];
      if (existing) {
        if (existing.trip_id !== id || existing.request_hash !== hash)
          throw new ConflictException(
            "Esta chave já foi usada em outra conferência.",
          );
        return {
          id,
          inspectionId: input.id,
          status: existing.result,
          unchanged: true,
        };
      }
      if (
        !["IN_PROGRESS", "ROUTE_ENDED_OPEN", "COMPLETED_REVIEW"].includes(
          t.status,
        )
      )
        throw new ConflictException(
          "A conferência exige uma viagem iniciada e ainda não concluída.",
        );
      if (t.version !== input.expectedVersion)
        throw new ConflictException(
          "A viagem mudou. Atualize e faça uma nova conferência.",
        );
      const now = this.clock.now();
      const passengers = (
        await db.query(
          "SELECT id FROM trip_passengers WHERE trip_id=$1 AND active ORDER BY id",
          [id],
        )
      ).rows;
      for (const p of passengers) await syncPassengerAlerts(db, p.id, now);
      await criticalClosureAlerts(db, t, req, now);
      const review = await finalReview(db, id);
      const status =
        review.ready && input.vanEmpty
          ? "COMPLETED"
          : t.status === "COMPLETED_REVIEW"
            ? "COMPLETED_REVIEW"
            : "ROUTE_ENDED_OPEN";
      await db.query(
        `INSERT INTO trip_inspections(id,trip_id,actor_id,membership_id,actor_name,assignment_id,inspected_at,walked_interior,checked_seats,checked_hiding_places,van_empty,note,request_hash,result,review_snapshot,trip_version)
        VALUES($1,$2,$3,$4,$5,$6,$7,true,true,true,$8,$9,$10,$11,$12,$13)`,
        [
          input.id,
          id,
          req.actor.id,
          member.id,
          req.actor.name,
          t.current_assignment_id,
          now,
          input.vanEmpty,
          input.note || null,
          hash,
          status,
          JSON.stringify(review),
          t.version + 1,
        ],
      );
      await db.query(
        `UPDATE trips SET status=$2,route_ended_at=COALESCE(route_ended_at,$3),completed_at=$4,completed_by=$5,version=version+1 WHERE id=$1`,
        [
          id,
          status,
          now,
          status === "COMPLETED" ? now : t.completed_at,
          status === "COMPLETED" ? req.actor.id : t.completed_by,
        ],
      );
      await audit(
        db,
        req.actor.id,
        status === "COMPLETED" ? "TRIP_COMPLETED" : "TRIP_ROUTE_ENDED_OPEN",
        id,
        req.context,
        {
          inspectionId: input.id,
          vanEmpty: input.vanEmpty,
          pendingPassengerIds: review.pending.map((p) => p.id),
          note: input.note,
        },
      );
      return { id, inspectionId: input.id, status };
    });
  }
  async add(
    req: ActorRequest,
    id: string,
    input: { expectedVersion: number; planId: string; reason: string },
  ) {
    return this.write(req, async (db) => {
      const t = await this.mutable(req, id, input.expectedVersion, db);
      if (t.status === "IN_PROGRESS" && t.driver_user_id !== req.actor.id)
        throw new ForbiddenException(
          "Somente o motorista designado inclui passageiros em andamento.",
        );
      await this.insertPassenger(req, t, input.planId, db, input.reason);
      await this.capacity(t, db);
      await db.query("UPDATE trips SET version=version+1 WHERE id=$1", [id]);
      return { id };
    });
  }
  async substitute(
    req: ActorRequest,
    id: string,
    input: {
      expectedVersion: number;
      driverId: string;
      vehicleId: string;
      reason: string;
    },
  ) {
    return this.write(req, async (db) => {
      const t = await this.mutable(req, id, input.expectedVersion, db);
      const { driver, vehicle } = await this.assignment(
        req,
        input.driverId,
        input.vehicleId,
        db,
      );
      if (driver.id === t.driver_membership_id && vehicle.id === t.vehicle_id)
        throw new BadRequestException("Escolha outro motorista ou veículo.");
      const replacement = {
        ...t,
        driver_user_id: driver.user_id,
        vehicle_id: vehicle.id,
        capacity: vehicle.capacity,
      };
      await this.capacity(replacement, db);
      if (t.status === "IN_PROGRESS")
        await this.freeAssignment(replacement, db);
      await db.query(
        "UPDATE trips SET driver_membership_id=$2,driver_user_id=$3,driver_name=$4,vehicle_id=$5,vehicle_name=$6,vehicle_plate=$7,capacity=$8,version=version+1 WHERE id=$1",
        [
          id,
          driver.id,
          driver.user_id,
          driver.name,
          vehicle.id,
          vehicle.name,
          vehicle.plate,
          vehicle.capacity,
        ],
      );
      await this.recordAssignment(
        req,
        id,
        t.driver_membership_id,
        t.vehicle_id,
        driver,
        vehicle,
        input.reason,
        db,
      );
      await audit(
        db,
        req.actor.id,
        "TRIP_ASSIGNMENT_CHANGED",
        id,
        req.context,
        {
          previousDriver: t.driver_membership_id,
          previousVehicle: t.vehicle_id,
          driverId: driver.id,
          vehicleId: vehicle.id,
          reason: input.reason,
        },
      );
      return { id };
    });
  }
  async cancel(
    req: ActorRequest,
    id: string,
    input: { expectedVersion: number; reason: string },
  ) {
    return this.write(req, async (db) => {
      const t = await this.mutable(req, id, input.expectedVersion, db);
      if (t.status !== "PLANNED")
        throw new ConflictException(
          "Uma viagem iniciada não pode ser cancelada. O encerramento depende da conferência final.",
        );
      const passengers = (
        await db.query(
          "SELECT * FROM trip_passengers WHERE trip_id=$1 ORDER BY operating_link_id,plan_id",
          [id],
        )
      ).rows;
      if (
        passengers.some(
          (p) => p.boarding_informed_at || p.alighting_informed_at,
        )
      )
        throw new ConflictException(
          "Há movimentação informada. Não é permitido cancelar.",
        );
      // Cancelamento preserva participações; libera apenas a reserva e o bloqueio do planejamento.
      for (const p of passengers) {
        await db.query(
          "SELECT id FROM operating_links WHERE id=$1 FOR UPDATE",
          [p.operating_link_id],
        );
        await db.query(
          "UPDATE daily_plans SET locked_at=NULL,version=version+1 WHERE id=$1",
          [p.plan_id],
        );
      }
      await db.query(
        "UPDATE trip_passengers SET active=false WHERE trip_id=$1",
        [id],
      );
      await db.query(
        "UPDATE trips SET status='CANCELLED',cancelled_by=$2,cancelled_at=$3,cancellation_reason=$4,version=version+1 WHERE id=$1",
        [id, req.actor.id, this.clock.now(), input.reason],
      );
      await audit(db, req.actor.id, "TRIP_CANCELLED", id, req.context, {
        reason: input.reason,
      });
      return { id };
    });
  }
}
