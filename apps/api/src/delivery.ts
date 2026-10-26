import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { config } from "./config";
@Injectable()
export class Delivery {
  assertAvailable() {
    if (config.production || process.env.DEV_DELIVERY !== "console")
      throw new ServiceUnavailableException("Canal de e-mail não configurado.");
  }
  async send(kind: "reset" | "invite", email: string, token: string) {
    this.assertAvailable();
    console.log(
      `\n[ENTREGA LOCAL — NÃO É E-MAIL] ${email}\n${config.webOrigin}/?flow=${kind}&token=${token}\n`,
    );
  }
}
