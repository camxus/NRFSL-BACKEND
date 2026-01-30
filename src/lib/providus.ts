// providus.ts
import axios, { AxiosInstance } from 'axios';
import fs from 'fs';
import FormData from 'form-data';
import dotenv from "dotenv"

import path from 'path';
import { fileTypeFromBuffer } from 'file-type';

const logFilePath = path.join(__dirname, 'error.log');

dotenv.config()
export class ProvidusAPI {
  private client: AxiosInstance;
  private login_token: string | null = null;
  private token: string | null = null;
  private bvn_token: string | null = null;
  private username: string | null = null;
  private password: string | null = null;

  constructor(baseURL: string) {
    this.client = axios.create({
      baseURL,
    });
    this.login_token = ""
    this.token = ""
    this.bvn_token = ""
    this.username = process.env.EXPRESS_PROVIDUS_USERNAME!
    this.password = process.env.EXPRESS_PROVIDUS_PASSWORD!
  }

  // Set token manually if you already have it
  setToken(token: string) {
    this.token = token;
    this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  // Login
  async login() {
    try {
      const response = await this.client.post('/account/ops/api/login', {
        username: this.username,
        password: this.password,
      });

      this.login_token = response.data.result.accessToken

      return response.data;
    } catch (error: any) {
      // Axios error with response
      if (error.response?.data?.message) {
        // message can be an array or string
        const message = Array.isArray(error.response.data.message)
          ? error.response.data.message.join(', ')
          : error.response.data.message;
        throw new Error(message);
      }
      // fallback error
      throw new Error(error.message || 'An unknown error occurred');
    }
  }

  // Validate BVN
  async validateBVN(bvn: string) {
    if (!this.login_token) throw new Error('Authorization token is missing');
    const response = await this.client.post(
      '/account/ops/api/validate_bvn',
      { bvn },
      {
        headers: {
          Authorization: `Bearer ${this.login_token}`,
        },
      }
    );
    this.bvn_token = response.data.result.accessToken
    return response.data;
  }

  // Verify Token (OTP or similar)
  async verifyToken(tokenCode: string, bvnToken?: string) {
    if (!this.bvn_token) throw new Error('BVN Authorization token is missing');
    const response = await this.client.post(
      '/account/ops/api/verifyToken',
      { token: tokenCode },
      {
        headers: {
          Authorization: `Bearer ${bvnToken ?? this.bvn_token}`,
        },
      }
    );

    this.setToken(response.data.result.accessToken)
    console.log("set token", response.data.result.accessToken)
    return response.data;
  }

  // Open Account
  async openAccount(accountData: {
    religion: string;
    country: string;
    altEmail: string;
    altPhone: string;
    currentAddress: string;
    passport?: Uint8Array;
    identity?: Uint8Array;
    utility?: Uint8Array;
    signature?: Uint8Array;
    NIN: string;
    occupation: string;
    motherMaidenName: string;
    residentState: string;
    residentLGA: string;
    residentOtherLGA: string;
  }) {
    if (!this.token) throw new Error('Authorization token is missing');

    try {
      const formData = new FormData();
      for (const key in accountData) {
        const value = (accountData as any)[key];
        if (['passport', 'identity', 'utility', 'signature'].includes(key)) {
          const type = await fileTypeFromBuffer(value);

          formData.append(key, value, {
            filename: `${key}${type ? '.' + type.ext : ''}`,
            contentType: type?.mime || 'application/octet-stream',
          });
        } else {
          formData.append(key, value);
        }
      }

      const response = await this.client.post(
        '/account/ops/api/individual_account_api',
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            Authorization: `Bearer ${this.token}`,
          },
        }
      );

      return response.data;
    } catch (error: any) {
      // Construct the message
      const message =
        error.response?.data?.message?.join?.(', ') ||
        error.response?.data?.message ||
        error.message ||
        'An unknown error occurred';

      // Log to console (optional)
      console.error(message);

      // Write to log file with timestamp
      const logEntry = `[${new Date().toISOString()}] ${message}\n`;
      fs.appendFileSync(logFilePath, logEntry, { encoding: 'utf8' });

      // Throw error after logging
      throw new Error(message);
    }
  }
}

// Export a singleton
export const providusAPI = new ProvidusAPI('https://test1.providusbank.com/api/v5');
