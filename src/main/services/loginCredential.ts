import { app, safeStorage } from "electron";
import fs from "node:fs";
import path from "node:path";

export interface SavedLoginCredential {
  account: string;
  rememberPassword: boolean;
  password: string;
  updatedAt: number;
}

interface SaveLoginCredentialPayload {
  account: string;
  password?: string;
  rememberPassword?: boolean;
}

interface EncryptedCredentialFile {
  version: 1;
  encrypted: string;
}

interface PlainCredentialFile {
  version: 1;
  account: string;
  rememberPassword: false;
  updatedAt: number;
}

type CredentialFile = EncryptedCredentialFile | PlainCredentialFile;

const LOGIN_CREDENTIAL_FILE = "saved-login-credential.json";

const getCredentialFilePath = (): string =>
  path.join(app.getPath("userData"), LOGIN_CREDENTIAL_FILE);

// 清洗持久化凭据，统一成内部可直接使用的固定结构。
const sanitizeCredential = (
  payload: Partial<SavedLoginCredential> | null | undefined,
): SavedLoginCredential | null => {
  const account = typeof payload?.account === "string" ? payload.account : "";

  if (!account) {
    return null;
  }

  const rememberPassword = Boolean(payload?.rememberPassword);
  const password =
    rememberPassword && typeof payload?.password === "string"
      ? payload.password
      : "";
  const updatedAt =
    typeof payload?.updatedAt === "number" ? payload.updatedAt : Date.now();

  return {
    account,
    rememberPassword,
    password,
    updatedAt,
  };
};
// 加密后的数据写到本地
const writeCredentialFile = (payload: CredentialFile): void => {
  fs.writeFileSync(
    getCredentialFilePath(),
    JSON.stringify(payload, null, 2),
    "utf-8",
  );
};

// 读取加密后的数据
const readCredentialFile = (): CredentialFile | null => {
  const filePath = getCredentialFilePath();
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as CredentialFile;
};

//获取保存的账号密码信息
export const getSavedLoginCredential = (): SavedLoginCredential | null => {
  try {
    const stored = readCredentialFile();
    if (!stored) {
      return null;
    }

    if ("encrypted" in stored) {
      // 只有系统加密能力可用时，才恢复带密码的记住密码数据。
      if (!safeStorage.isEncryptionAvailable()) {
        return null;
      }

      const decrypted = safeStorage.decryptString(
        Buffer.from(stored.encrypted, "base64"),
      );
      return sanitizeCredential(JSON.parse(decrypted));
    }

    return sanitizeCredential({
      account: stored.account,
      rememberPassword: false,
      password: "",
      updatedAt: stored.updatedAt,
    });
  } catch (error) {
    console.error("Failed to read saved login credential:", error);
    return null;
  }
};

//保存账号密码信息到本地
export const saveLoginCredential = (
  payload: SaveLoginCredentialPayload,
): SavedLoginCredential | null => {
  const credential = sanitizeCredential({
    account: payload.account,
    rememberPassword: payload.rememberPassword,
    password: payload.password,
    updatedAt: Date.now(),
  });

  if (!credential) {
    clearSavedLoginCredential();
    return null;
  }

  try {
    if (safeStorage.isEncryptionAvailable()) {
      // 记住密码时，完整凭据只以加密后的形式落盘。
      const encrypted = safeStorage
        .encryptString(JSON.stringify(credential))
        .toString("base64");

      writeCredentialFile({
        version: 1,
        encrypted,
      });
    } else {
      // 降级模式下只保留账号，避免明文密码被持久化。
      writeCredentialFile({
        version: 1,
        account: credential.account,
        rememberPassword: false,
        updatedAt: credential.updatedAt,
      });
    }

    return getSavedLoginCredential();
  } catch (error) {
    console.error("Failed to save login credential:", error);
    return null;
  }
};

export const clearSavedLoginCredential = (): void => {
  try {
    const filePath = getCredentialFilePath();
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error("Failed to clear saved login credential:", error);
  }
};
