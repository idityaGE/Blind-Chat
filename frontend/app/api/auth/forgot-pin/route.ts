import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { generateResetToken } from '@/helpers/helper';
import { sendMail } from '@/services/mail/mail';
import { checkRateLimit, recordAttempt } from '@/utils/rateLimit';

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Validate email format
    if (!email.endsWith('@curaj.ac.in')) {
      return NextResponse.json(
        { error: 'Invalid email domain. Must be a CURAJ email address.' },
        { status: 400 }
      );
    }

    // Extract and validate enrollment ID
    const enrollmentId = email.split('@')[0].toUpperCase();
    const enrollmentIdRegex = /^\d{4}[A-Za-z]+\d{3}$/;
    if (!enrollmentIdRegex.test(enrollmentId)) {
      return NextResponse.json(
        { error: 'Invalid enrollment ID format' },
        { status: 400 }
      );
    }

    // Check rate limit
    const rateLimitResult = await checkRateLimit(email);
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

    // Find user
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      // For security, don't reveal whether the account exists
      return NextResponse.json({
        message: 'If an account exists with this enrollment ID, you will receive PIN reset instructions.'
      });
    }

    if (!user.isVerified) {
      return NextResponse.json(
        { error: 'Please verify your email first' },
        { status: 400 }
      );
    }

    // Generate reset token
    const resetToken = await generateResetToken(user.id);
    const resetTokenExpiry = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    // Update user with reset token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken,
        resetTokenExpiry
      }
    });

    // Send reset email
    const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/reset-pin?token=${resetToken}`;

    const mailOptions = {
      to: email,
      subject: 'Reset Your PIN',
      html: `
        <h1>PIN Reset Request</h1>
        <h2>From: Blind CURAJ</h2>
        <p>Click the link below to reset your PIN. This link will expire in 30 minutes:</p>
        <a href="${resetUrl}">${resetUrl}</a>
        <p>If you didn't request this, please ignore this email.</p>
      `
    };

    const emailSent = await sendMail(mailOptions);
    if (!emailSent) {
      throw new Error('Failed to send reset email');
    }

    // Record the attempt only after successful email send
    await recordAttempt(email);

    return NextResponse.json({
      message: 'If an account exists with this enrollment ID, you will receive PIN reset instructions.'
    });

  } catch (error) {
    console.error('Forgot PIN error:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}