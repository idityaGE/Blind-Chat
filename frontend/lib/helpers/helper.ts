import { hash, compare } from 'bcryptjs';
import { sign, verify } from 'jsonwebtoken';


// JWT Token
export const generateToken = (payload: any) => {
  const token = sign(payload, process.env.JWT_SECRET!, {
    expiresIn: '1h',
  });
  return token;
}

export const verifyToken = (token: string) => {
  try {
    const payload = verify(token, process.env.JWT_SECRET!);
    return payload;
  } catch (error) {
    console.error('Error verifying token:', error);
  }
}


// Hashing and Verifying PIN
export const hashPin = async (pin: string) => {
  try {
    const hashedPin = await hash(pin, 10);
    return hashedPin;
  } catch (error) {
    console.error('Error hashing pin:', error);
  }
}

export const verifyPin = async (pin: string, hashedPin: string) => {
  try {
    const isValid = await compare(pin, hashedPin);
    return isValid;
  } catch (error) {
    console.error('Error verifying pin:', error);
  }
}