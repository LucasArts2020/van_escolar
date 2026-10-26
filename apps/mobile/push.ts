import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";
export type PushClient = <T>(
  path: string,
  body?: unknown,
  auth?: string | null,
  method?: string,
) => Promise<T>;
const key = "caminho.installation";
const enabledKey = "caminho.push.enabled";
let operations: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const next = operations.then(fn, fn);
  operations = next.catch(() => {});
  return next;
}
export async function notificationsModule() {
  if (Platform.OS === "web" || Constants.expoGoConfig) return null;
  return import("expo-notifications");
}
async function installation() {
  let id = await SecureStore.getItemAsync(key);
  if (!id) {
    id = Crypto.randomUUID();
    await SecureStore.setItemAsync(key, id);
  }
  return id;
}
export function registerPush(client: PushClient, ask = true) {
  return serialize(() => registerPushInternal(client, ask));
}
async function registerPushInternal(client: PushClient, ask: boolean) {
  if (!ask && (await SecureStore.getItemAsync(enabledKey)) !== "true") return;
  const notifications = await notificationsModule();
  if (!notifications) {
    if (ask)
      throw new Error(
        "Use um development build do aplicativo para ativar push. A central continua disponível neste ambiente.",
      );
    return;
  }
  const projectId =
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
    Constants.expoConfig?.extra?.eas?.projectId ||
    Constants.easConfig?.projectId;
  if (!projectId) {
    if (ask)
      throw new Error(
        "Configure o projeto EAS para ativar as notificações no aparelho.",
      );
    return;
  }
  if (Platform.OS === "android")
    await notifications.setNotificationChannelAsync("updates", {
      name: "Atualizações do Caminho",
      importance: notifications.AndroidImportance.DEFAULT,
    });
  let permission = await notifications.getPermissionsAsync();
  if (permission.status !== "granted" && ask)
    permission = await notifications.requestPermissionsAsync();
  if (permission.status !== "granted") {
    await unregisterPushInternal(client);
    if (ask)
      throw new Error(
        "Permissão de notificações não concedida. Consulte a central para acompanhar as atualizações.",
      );
    return;
  }
  const token = (await notifications.getExpoPushTokenAsync({ projectId })).data;
  await client("notifications/devices", {
    installationId: await installation(),
    token,
  });
  await SecureStore.setItemAsync(enabledKey, "true");
}
export function unregisterPush(client: PushClient) {
  return serialize(() => unregisterPushInternal(client));
}
async function unregisterPushInternal(client: PushClient) {
  const id = await SecureStore.getItemAsync(key);
  if (id) await client("notifications/devices/remove", { installationId: id });
  await SecureStore.setItemAsync(enabledKey, "false");
}
