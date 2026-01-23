// providus.ts
import axios, { AxiosInstance } from 'axios';
import fs from 'fs';
import FormData from 'form-data';

export class ProvidusAPI {
  private client: AxiosInstance;
  private token: string | null = null;
  private username: string | null = null;
  private password: string | null = null;

  constructor(baseURL: string) {
    this.client = axios.create({
      baseURL,
    });
    this.token = process.env.EXPRESS_PROVIDUS_TOKEN!
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
    const response = await this.client.post('/account/ops/api/login', {
      username: this.username,
      password: this.password,
    });
    const { token } = response.data; // assuming API returns a token
    this.setToken(token);
    return response.data;
  }

  // Validate BVN
  async validateBVN(bvn: string) {
    if (!this.token) throw new Error('Authorization token is missing');
    const response = await this.client.post(
      '/account/ops/api/validate_bvn',
      { bvn },
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      }
    );
    return response.data;
  }

  // Verify Token (OTP or similar)
  async verifyToken(tokenCode: string) {
    if (!this.token) throw new Error('Authorization token is missing');
    const response = await this.client.post(
      '/account/ops/api/verifyToken',
      { token: tokenCode },
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      }
    );
    return response.data;
  }

  // Open Account
  async openAccount(accountData: {
    religion: string;
    country: string;
    altEmail: string;
    altPhone: string;
    currentAddress: string;
    passport: string;
    identity: string;
    utility: string;
    signature: string;
    NIN: string;
    occupation: string;
    motherMaidenName: string;
    residentState: string;
    residentLGA: string;
    residentOtherLGA: string;
  }) {
    if (!this.token) throw new Error('Authorization token is missing');

    const formData = new FormData();
    for (const key in accountData) {
      const value = (accountData as any)[key];
      if (['passport', 'identity', 'utility', 'signature'].includes(key)) {
        formData.append(key, fs.createReadStream(value));
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
  }
}

// Export a singleton
export const providusAPI = new ProvidusAPI('https://test1.providusbank.com/api/v5/account/ops/api');
