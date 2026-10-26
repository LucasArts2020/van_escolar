import { Injectable } from "@nestjs/common";
export class PushFailure extends Error {
  constructor(
    public code: string,
    public retryable = true,
  ) {
    super(code);
  }
}
@Injectable()
export class ExpoPush {
  enabled() {
    return process.env.EXPO_PUSH_ENABLED === "true";
  }
  async request(path: string, body: unknown): Promise<any> {
    let response: Response;
    try {
      response = await fetch("https://exp.host/--/api/v2/push/" + path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(process.env.EXPO_ACCESS_TOKEN
            ? { Authorization: "Bearer " + process.env.EXPO_ACCESS_TOKEN }
            : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new PushFailure("NETWORK_OR_TIMEOUT");
    }
    if (!response.ok)
      throw new PushFailure(
        "HTTP_" + response.status,
        response.status === 429 || response.status >= 500,
      );
    let value: any;
    try {
      value = await response.json();
    } catch {
      throw new PushFailure("INVALID_RESPONSE");
    }
    if (value.errors?.length)
      throw new PushFailure("EXPO_REQUEST_REJECTED", false);
    return value.data;
  }
  async send(token: string, notificationId: string, membershipId: string) {
    // A tela bloqueada e o payload externo não expõem nome, escola ou estado da criança.
    const ticket = await this.request("send", {
      to: token,
      title: "Caminho",
      body: "Há uma atualização no seu espaço. Abra para consultar.",
      data: { notificationId, membershipId },
      sound: "default",
      channelId: "updates",
    });
    const result = Array.isArray(ticket) ? ticket[0] : ticket;
    if (result?.status !== "ok" || typeof result.id !== "string") {
      const code = String(result?.details?.error || "INVALID_TICKET");
      throw new PushFailure(
        code,
        code === "MessageRateExceeded" || code === "INVALID_TICKET",
      );
    }
    return result.id as string;
  }
  async receipt(ticketId: string) {
    const data = await this.request("getReceipts", { ids: [ticketId] });
    const receipt = data?.[ticketId];
    if (!receipt) return null;
    if (receipt.status !== "ok")
      throw new PushFailure(
        String(receipt.details?.error || "RECEIPT_REJECTED"),
        false,
      );
    return true;
  }
}
