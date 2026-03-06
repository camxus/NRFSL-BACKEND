export interface S3Location {
  bucket: string
  key: string
}

export interface SignUpInput {
  username: string;
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  birthdate: string;
  phone_number: string;
  avatar?: S3Location;

  kyc: {
    bvn: number,
    nin: number,
    passport: string,
    identity: string,
    utility: string,
    signature: string,
    religion: string,
    country: string,
    altEmail: string,
    altPhone: string,
    currentAddress: string,
    occupation: string,
    motherMaidenName: string,
    residentState: string,
    residentLGA: string,
    residentOtherLGA: string,
  }

  providus_token: string
}

export interface SignInInput {
  email: string;
  password: string;
}

export interface User {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  birthdate: string;
  phone_number: string;

  avatar?: S3Location | string;
  kyc: {
    bvn: number,
    nin: number,
    passport: S3Location,
    identity: S3Location,
    utility: S3Location,
    signature: S3Location,
    religion: string,
    country: string,
    altEmail: string,
    altPhone: string,
    currentAddress: string,
    occupation: string,
    motherMaidenName: string,
    residentState: string,
    residentLGA: string,
    residentOtherLGA: string,
  }

  providus?: {
    AccountNUBAN: string,
    AccountName: string,
    AccountNumberFull: string,
    CustomerNumber: string,
    ResponseCode: string,
    ResponseDetInfo: string,
  },

  expo?: {
    push_token: string
  }
  created_at: string;
  updated_at?: string;
}
