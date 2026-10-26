import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createPlanningMaterializer,
  materializePlanning,
} from "../../shared/materialize-planning";

test("abertura repetida e concorrente usa um pedido por tela e permite recuperar falha", async () => {
  const materialize = createPlanningMaterializer();
  const options = { links: [{ id: "a", today: "2026-10-26" }] };
  let posts = 0;
  await Promise.all(
    Array.from({ length: 4 }, () =>
      materialize("2026-10-27", options, async () => {
        posts++;
      }),
    ),
  );
  assert.equal(posts, 1);
  const failing = createPlanningMaterializer();
  await assert.rejects(
    failing("2026-10-27", options, async () => {
      throw new Error("Sem conexão");
    }),
  );
  await failing("2026-10-27", options, async () => {
    posts++;
  });
  assert.equal(posts, 2);
  await createPlanningMaterializer()("2026-10-27", options, async () => {
    posts++;
  });
  assert.equal(posts, 3, "Outro contexto/tela possui seu próprio cache");
  const withoutPolicy = createPlanningMaterializer();
  await withoutPolicy("2026-10-27", options, async () => ({ skipped: ["a"] }));
  await withoutPolicy("2026-10-27", options, async () => {
    posts++;
    return { skipped: [] };
  });
  assert.equal(
    posts,
    4,
    "Configuração ausente permite nova materialização após ajuste",
  );
});

test("a agenda materializa sessenta vínculos em um pedido, sem declarar uso", async () => {
  const posts: unknown[] = [];
  await materializePlanning(
    "2026-10-27",
    {
      links: Array.from({ length: 60 }, (_, i) => ({
        id: String(i),
        today: "2026-10-26",
      })),
    },
    async (body) => {
      posts.push(body);
    },
  );
  assert.deepEqual(posts, [{ date: "2026-10-27" }]);
});
test("consulta passada ou além da janela não materializa planejamento", async () => {
  const posts: unknown[] = [];
  for (const date of ["2026-10-25", "2026-11-26", ""])
    await materializePlanning(
      date,
      { links: [{ id: "a", today: "2026-10-26" }] },
      async (body) => {
        posts.push(body);
      },
    );
  assert.deepEqual(posts, []);
});
test("fuso de cada transporte define os vínculos que podem ser materializados", async () => {
  const posts: unknown[] = [];
  await materializePlanning(
    "2026-10-26",
    {
      links: [
        { id: "hoje", today: "2026-10-26" },
        { id: "amanha-local", today: "2026-10-27" },
      ],
    },
    async (body) => {
      posts.push(body);
    },
  );
  assert.deepEqual(posts, [{ date: "2026-10-26", linkId: "hoje" }]);
});
