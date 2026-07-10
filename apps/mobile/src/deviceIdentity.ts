import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

const DEVICE_KEY = "inspectiq.mobile.device-id.v1";

export async function deviceIdentity(): Promise<string> {
  const stored = await SecureStore.getItemAsync(DEVICE_KEY);
  if (stored) return stored;
  const generated = `mobile-${Crypto.randomUUID()}`;
  await SecureStore.setItemAsync(DEVICE_KEY, generated, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
  });
  return generated;
}
