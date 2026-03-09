import Joi from 'joi';

export const signUpSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  first_name: Joi.string().min(1).max(50).required(),
  last_name: Joi.string().min(1).max(50).required(),
  birthdate: Joi.string().required(),
  phone_number: Joi.string().required(),
  avatar: Joi.string().optional(),
  kyc: Joi.string(),

  providus_token: Joi.string().required()
  // kyc: Joi.object({
  //   bvn: Joi.string().optional(),
  //   nin: Joi.string().optional(),
  //   face_photo: Joi.string().optional(),
  //   passport_photo: Joi.string().optional(),
  //   signature_file: Joi.string().optional(),
  //   utility_file: Joi.string().optional(),
  //    religion: Joi.string().optional(),
  //   country: Joi.string().optional(),
  //   altEmail: Joi.string().optional(),
  //   altPhone: Joi.string().optional(),
  //   currentAddress: Joi.string().optional(),
  //   occupation: Joi.string().optional(),
  //   motherMaidenName: Joi.string().optional(),
  //   residentState: Joi.string().optional(),
  //   residentLGA: Joi.string().optional(),
  //   residentOtherLG: Joi.string().optional()
  // })
});

export const signInSchema = Joi.object({
  email: Joi.string().required(),
  password: Joi.string().required(),
});

export const forgotPasswordSchema = Joi.object({
  email: Joi.string().required(),
});

export const confirmPasswordSchema = Joi.object({
  email: Joi.string().email().required(),
  code: Joi.string().required(),
  newPassword: Joi.string().min(8).required(),
});

export const newPasswordSchema = Joi.object({
  email: Joi.string().email().required(),
  newPassword: Joi.string().min(8).required(),
});