import { Request, RequestHandler, Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { validationErrorHandler } from "../middleware/errorMiddleware";
import {
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import {
  signUpSchema,
  signInSchema,
  forgotPasswordSchema,
  confirmPasswordSchema,
  newPasswordSchema,
} from "../utils/validation/authValidation";
import { SignInInput, SignUpInput, User } from "../types";
import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  AdminConfirmSignUpCommand,
  InitiateAuthCommand,
  AuthFlowType,
  GetUserCommand,
  AdminSetUserPasswordCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  AdminDeleteUserCommand,
  AdminUpdateUserAttributesCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { v4 as uuidv4 } from "uuid";
import { copyItemImage, getSignedImage, saveItemImage } from "../utils/s3";
import crypto from "crypto";
import multer from "multer";
import { lookup as mimeLookup, extension as mimeExtension } from "mime-types";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { AuthenticatedRequest } from "../middleware/auth";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import jwt from "jsonwebtoken"
import { providusAPI } from "../lib/providus"
import { identity } from "lodash";
import Joi from "joi";

const upload = multer({
  storage: multer.memoryStorage(), // stores file in memory for direct upload to S3
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit (optional)
});

const client = new DynamoDBClient({ region: process.env.AWS_REGION_CODE });
const s3Client = new S3Client({ region: process.env.AWS_REGION_CODE });
const USERS_TABLE = process.env.DYNAMODB_USERS_TABLE || "Users";

const cognito = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION_CODE,
});

export const uploadKycFiles = upload.fields([
  { name: "passport", maxCount: 1 },
  { name: "identity", maxCount: 1 },
  { name: "utility", maxCount: 1 },
  { name: "signature", maxCount: 1 },
  { name: "avatar_file", maxCount: 1 }, // optional
]);

export const signup = asyncHandler(async (req: Request, res: Response) => {
  const { error, value } = signUpSchema.validate(req.body);
  if (error) throw validationErrorHandler(error);

  const { password, email, first_name, last_name, birthdate, providus_token } =
    value as SignUpInput;

  const kyc =
    typeof value.kyc === "string"
      ? JSON.parse((value.kyc as string) || "{}")
      : value.kyc;

  const {
    bvn,
    nin,
    religion,
    country,
    altEmail,
    altPhone,
    currentAddress,
    occupation,
    motherMaidenName,
    residentState,
    residentLGA,
    residentOtherLGA
  } = kyc

  let passport_photo =
    typeof value.passport_photo === "string"
      ? JSON.parse((value.passport_photo as string) || "{}")
      : value.passport_photo;

  let signature_file =
    typeof value.signature_file === "string"
      ? JSON.parse((value.signature_file as string) || "{}")
      : value.signature_file;

  let utility_file =
    typeof value.utility_file === "string"
      ? JSON.parse((value.utility_file as string) || "{}")
      : value.utility_file;

  let avatar =
    typeof value.avatar === "string"
      ? JSON.parse((value.avatar as string) || "{}")
      : value.avatar;

  let createdUserSub: string | null = null;
  let uploadedAvatarKey: string | null = null;
  let userData: User | null = null;

  try {
    // Cognito signup
    const command = new SignUpCommand({
      ClientId: process.env.EXPRESS_COGNITO_CLIENT_ID!,
      SecretHash: crypto
        .createHmac("SHA256", process.env.EXPRESS_COGNITO_SECRET!)
        .update(email + process.env.EXPRESS_COGNITO_CLIENT_ID!)
        .digest("base64"),
      Username: email,
      Password: password,
      UserAttributes: [
        { Name: "given_name", Value: first_name },
        { Name: "family_name", Value: last_name },
      ],
    });

    const response = await cognito.send(command);

    // Auto-confirm (development only)
    await cognito.send(
      new AdminConfirmSignUpCommand({
        UserPoolId: process.env.EXPRESS_COGNITO_USER_POOL_ID!,
        Username: email,
      })
    );

    await cognito.send(
      new AdminUpdateUserAttributesCommand({
        UserPoolId: process.env.EXPRESS_COGNITO_USER_POOL_ID!,
        Username: email,
        UserAttributes: [
          {
            Name: "email_verified",
            Value: "true",
          },
        ],
      })
    );


    createdUserSub = response.UserSub!;
    const s3Client = new S3Client({ region: process.env.AWS_REGION_CODE });
    const key = (ext: string) => `profile_images/${createdUserSub}.${ext}`;

    let uploaded: Record<string, { bucket: string; key: string; }> = {};

    // Case 1: Avatar came from temp bucket
    if (avatar) {
      const ext = avatar.key.split(".").pop()!;
      const destination = await copyItemImage(
        s3Client,
        { bucket: avatar.bucket, key: avatar.key },
        {
          bucket: process.env.EXPRESS_S3_APP_BUCKET!,
          key: key(ext),
        }
      );

      // Delete temp file
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: process.env.EXPRESS_S3_TEMP_BUCKET!,
          Key: avatar.key,
        })
      );

      uploaded.avatar = destination;
      uploadedAvatarKey = destination.key;
    }

    const files = req.files as {
      passport?: Express.Multer.File[];
      identity?: Express.Multer.File[];
      utility?: Express.Multer.File[];
      signature?: Express.Multer.File[];
    };

    async function uploadKyc(
      file: Express.Multer.File,
      folder: string
    ) {
      const ext = mimeExtension(file.mimetype);
      if (!ext) throw new Error("Unsupported file type");

      return saveItemImage(
        s3Client,
        process.env.EXPRESS_S3_APP_BUCKET!,
        `kyc/${createdUserSub}/${folder}.${ext}`,
        file.buffer,
        false
      );
    }

    if (files.passport?.[0]) {
      uploaded.passport = await uploadKyc(files.passport[0], "passport");
    }

    if (files.identity?.[0]) {
      uploaded.identity = await uploadKyc(files.identity[0], "identity");
    }

    if (files.utility?.[0]) {
      uploaded.utility = await uploadKyc(files.utility[0], "utility");
    }

    if (files.signature?.[0]) {
      uploaded.signature = await uploadKyc(files.signature[0], "signature");
    }


    // Build DynamoDB user object
    userData = {
      user_id: createdUserSub,
      email,
      first_name,
      last_name,
      birthdate,
      kyc: {
        bvn,
        nin,
        passport: uploaded.passport,
        identity: uploaded.identity,
        utility: uploaded.utility,
        signature: uploaded.signature,
        religion,
        country,
        altEmail,
        altPhone,
        currentAddress,
        occupation,
        motherMaidenName,
        residentState,
        residentLGA,
        residentOtherLGA
      },
      avatar: uploaded.avatar || null,
      created_at: new Date().toISOString(),
    };

    function filesToBase64(files: Express.Multer.File[] | undefined): string {
      if (!files || files.length === 0) return "";
      return files[0].buffer.toString("base64");
    }

    await providusAPI.login()
    await providusAPI.setToken(providus_token)
    await providusAPI.openAccount({
      ...userData.kyc, NIN: userData.kyc.nin.toString(),
      passport: files?.passport?.[0].buffer,
      identity: files?.identity?.[0].buffer,
      utility: files?.utility?.[0].buffer,
      signature: files?.signature?.[0].buffer,
    })

    //TODO INSERT PROVIDUS USER DATA

    // Insert user
    await client.send(
      new PutItemCommand({
        TableName: USERS_TABLE,
        Item: marshall(userData, {
          removeUndefinedValues: true,
        }),
      })
    );


    res.status(201).json({
      user: {
        ...userData,
      },
    });
  } catch (error: any) {
    console.error("Signup error:", error);

    // Rollback cleanup
    try {
      if (userData) {
        // Remove DynamoDB entry
        await client.send(
          new DeleteItemCommand({
            TableName: USERS_TABLE,
            Key: marshall({ user_id: userData.user_id }),
          })
        );
      }

      if (createdUserSub) {
        // Delete Cognito user
        await cognito.send(
          new AdminDeleteUserCommand({
            UserPoolId: process.env.EXPRESS_COGNITO_USER_POOL_ID!,
            Username: email,
          })
        );
      }

      if (uploadedAvatarKey) {
        // Delete avatar from S3
        const s3Client = new S3Client({ region: process.env.AWS_REGION_CODE });
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: process.env.EXPRESS_S3_APP_BUCKET!,
            Key: uploadedAvatarKey,
          })
        );
      }
    } catch (cleanupErr) {
      console.error("Cleanup failed:", cleanupErr);
    }

    res.status(400).json({ error: error.message });
  }
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { error, value } = signInSchema.validate(req.body);
  if (error) throw validationErrorHandler(error);

  const { email, password } = value as SignInInput;

  try {
    const command = new InitiateAuthCommand({
      AuthFlow: "USER_PASSWORD_AUTH" as AuthFlowType,
      ClientId: process.env.EXPRESS_COGNITO_CLIENT_ID,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
        SECRET_HASH: crypto
          .createHmac("SHA256", process.env.EXPRESS_COGNITO_SECRET!)
          .update(email + process.env.EXPRESS_COGNITO_CLIENT_ID)
          .digest("base64"),
      },
    });

    const response = await cognito.send(command);

    if (!response.AuthenticationResult?.AccessToken) {
      return res.status(401).json({ error: "Authentication failed" });
    }

    // Get user info from Cognito
    const userResponse = await cognito.send(
      new GetUserCommand({
        AccessToken: response.AuthenticationResult.AccessToken,
      })
    );

    const userAttributes =
      userResponse.UserAttributes?.reduce((acc, attr) => {
        if (attr.Name && attr.Value) {
          acc[attr.Name] = attr.Value;
        }
        return acc;
      }, {} as Record<string, string>) || {};

    const sub = userAttributes["sub"];

    // Get user details from DynamoDB
    const userDetailsResponse = await client.send(
      new GetItemCommand({
        TableName: USERS_TABLE,
        Key: marshall({ user_id: sub }),
      })
    );

    let userDetails = null;
    if (userDetailsResponse.Item) {
      userDetails = unmarshall(userDetailsResponse.Item);

      // Get signed URL for avatar if it exists
      if (userDetails.avatar) {
        userDetails.avatar = await getSignedImage(
          s3Client,
          userDetails.avatar
        );
      }
    }

    res.status(200).json({
      token: {
        accessToken: response.AuthenticationResult.AccessToken,
        refreshToken: response.AuthenticationResult.RefreshToken,
        idToken: response.AuthenticationResult.IdToken,
        expiresIn: response.AuthenticationResult.ExpiresIn,
      },
      user: userDetails,
    });
  } catch (error: any) {
    console.error("Login error:", error);
    res.status(401).json({ error: error.message });
  }
});

export const refreshToken = asyncHandler(
  async (req: Request, res: Response) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        error: "Refresh token is required",
      });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "Missing Authorization header" });
    }

    const token = authHeader.split(" ")[1]; // "Bearer <token>"
    const decoded: any = jwt.decode(token);

    if (!decoded) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const email = decoded["email"] || decoded["cognito:email"];

    try {
      const command = new InitiateAuthCommand({
        AuthFlow: "REFRESH_TOKEN_AUTH",
        ClientId: process.env.EXPRESS_COGNITO_CLIENT_ID,
        AuthParameters: {
          REFRESH_TOKEN: refreshToken,
          SECRET_HASH: crypto
            .createHmac("SHA256", process.env.EXPRESS_COGNITO_SECRET!)
            .update(email + process.env.EXPRESS_COGNITO_CLIENT_ID)
            .digest("base64"),
        },
      });

      const response = await cognito.send(command);

      return res.status(200).json({
        accessToken: response.AuthenticationResult?.AccessToken,
        refreshToken: response.AuthenticationResult?.RefreshToken,
        idToken: response.AuthenticationResult?.IdToken,
        expiresIn: response.AuthenticationResult?.ExpiresIn,
      });
    } catch (error: any) {
      return res.status(401).json({
        error: error.message || "Failed to refresh token",
      });
    }
  }
);

export const forgotPassword = asyncHandler(
  async (req: Request, res: Response) => {
    const { error, value } = forgotPasswordSchema.validate(req.body);
    if (error) throw validationErrorHandler(error);

    const { email } = value;

    try {
      await cognito.send(
        new ForgotPasswordCommand({
          ClientId: process.env.EXPRESS_COGNITO_CLIENT_ID!,
          Username: email,
          SecretHash: crypto
            .createHmac("SHA256", process.env.EXPRESS_COGNITO_SECRET!)
            .update(email + process.env.EXPRESS_COGNITO_CLIENT_ID)
            .digest("base64"),
        })
      );

      res.status(200).json({ message: "Password reset code sent" });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

export const confirmPassword = asyncHandler(
  async (req: Request, res: Response) => {
    const { error, value } = confirmPasswordSchema.validate(req.body);
    if (error) throw validationErrorHandler(error);

    const { email, code, newPassword } = value;

    try {
      await cognito.send(
        new ConfirmForgotPasswordCommand({
          ClientId: process.env.EXPRESS_COGNITO_CLIENT_ID!,
          Username: email,
          ConfirmationCode: code,
          Password: newPassword,
          SecretHash: crypto
            .createHmac("SHA256", process.env.EXPRESS_COGNITO_SECRET!)
            .update(email + process.env.EXPRESS_COGNITO_CLIENT_ID)
            .digest("base64"),
        })
      );

      res.status(200).json({ message: "Password reset successful" });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

export const setNewPassword = asyncHandler(
  async (req: Request, res: Response) => {
    const { error, value } = newPasswordSchema.validate(req.body);
    if (error) throw validationErrorHandler(error);

    const { email, newPassword } = value;

    try {
      const command = new AdminSetUserPasswordCommand({
        UserPoolId: process.env.EXPRESS_COGNITO_USER_POOL_ID!,
        Username: email,
        Password: newPassword,
        Permanent: true,
      });

      await cognito.send(command);

      res.status(200).json({ message: "Password updated successfully" });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

export const getPresignURL = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { bucket = '', key, content_type } = req.query;

  const command = new PutObjectCommand({
    Bucket: (bucket || process.env.EXPRESS_S3_TEMP_BUCKET) as string,
    Key: key as string,
    ContentType: content_type as string
  });

  const signedUrl = await getSignedUrl(s3Client as any, command as any, { expiresIn: 300 }); // 5 minutes

  res.status(200).json({
    upload_url: signedUrl,
    key,
  });
});

export const getPresignPOST = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { key, content_type } = req.query;

  // ✅ Force users into their own folder (no arbitrary keys)
  const userId = req.user?.user_id; // adjust if you store differently

  // ✅ Max file size: 50 MB
  const MAX_FILE_SIZE = 50 * 1024 * 1024;

  const presignedPost = await createPresignedPost(s3Client as any, {
    Bucket: process.env.EXPRESS_S3_TEMP_BUCKET as string,
    Key: key as string,
    Conditions: [
      ["content-length-range", 0, MAX_FILE_SIZE],              // enforce file size
      ["eq", "$Content-Type", content_type as string],         // enforce MIME type
      ["starts-with", "$key", `${userId}/`],      // enforce key prefix
    ],
    Fields: {
      "Content-Type": content_type as string,
    },
    Expires: 300, // URL valid for 5 minutes
  });

  res.status(200).json({
    upload_url: presignedPost.url,
    fields: presignedPost.fields,
    key,
    max_size: MAX_FILE_SIZE,
  });
});

export const validateBVN = asyncHandler(
  async (req: Request, res: Response) => {
    const { error, value } = Joi.object({
      bvn_token: Joi.string()
        .length(11)
        .pattern(/^\d+$/)
        .required(),
    }).validate(req.body);
    if (error) throw validationErrorHandler(error);

    const { bvn_token } = value;

    try {
      await providusAPI.login();

      const result = await providusAPI.validateBVN(bvn_token);

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err: any) {
      console.error("BVN validation error:", err);

      return res.status(400).json({
        success: false,
        error: err.message || "BVN validation failed",
      });
    }
  }
);

export const verifyBVNToken = asyncHandler(
  async (req: Request, res: Response) => {
    const { error, value } = Joi.object({
      bvn_token: Joi.string().required(),
      verify_token: Joi.string().required(),
    }).validate(req.body);
    if (error) throw validationErrorHandler(error);

    const { verify_token, bvn_token } = value;

    try {
      await providusAPI.login();

      const result = await providusAPI.verifyToken(verify_token, bvn_token);

      return res.status(200).json(result);
    } catch (err: any) {
      console.error("BVN verification error:", err);

      return res.status(400).json({
        success: false,
        error: err.message || "BVN verificaiton failed",
      });
    }
  }
);
