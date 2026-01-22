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
  avatar?: S3Location;

  bvn: number,
  nin: number,
  face_photo: string,
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

export interface SignInInput {
  email: string;
  password: string;
}

export interface User {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  avatar?: S3Location | string;
  kyc: {
    bvn: number,
    nin: number,
    face_photo: string,
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
  expo?: {
    push_token: string
  }
  created_at: string;
  updated_at?: string;
}
