import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { verifyResetToken } from '@/helpers/helper';
import { hashPin } from '@/helpers/helper';
import { checkRateLimit, recordAttempt } from '@/utils/rateLimit';

export async function POST(req: Request) {
  try {
    const { token, newPin } = await req.json();

    if (!token || !newPin) {
      return NextResponse.json(
        { error: 'Token and new PIN are required' },
        { status: 400 }
      );
    }

    // Verify token and get user ID
    const userId = await verifyResetToken(token);

    // Find user with valid reset token
    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        resetToken: token,
        resetTokenExpiry: {
          gt: new Date()
        }
      }
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid or expired reset token' },
        { status: 400 }
      );
    }

    // Check rate limit using user's email
    const rateLimitResult = await checkRateLimit(user.email);
    if (!rateLimitResult.success) {
      const retryAfter = Math.ceil((rateLimitResult.reset - Math.floor(Date.now() / 1000)) / 60);
      return NextResponse.json(
        {
          error: 'Too many reset attempts',
          retryAfter
        },
        {
          status: 429,
          headers: {
            'Retry-After': rateLimitResult.reset.toString()
          }
        }
      );
    }

    // Hash new PIN
    const hashedPin = await hashPin(newPin);
    if (!hashedPin) {
      throw new Error('Error hashing PIN');
    }

    // Update user's PIN and clear reset token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        pin: hashedPin,
        resetToken: null,
        resetTokenExpiry: null
      }
    });

    // Record the attempt only after successful PIN reset
    await recordAttempt(user.email);

    return NextResponse.json({
      message: 'PIN successfully reset'
    });

  } catch (error) {
    console.error('Reset PIN error:', error);
    return NextResponse.json(
      { error: 'Failed to reset PIN' },
      { status: 500 }
    );
  }
}