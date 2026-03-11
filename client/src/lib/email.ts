/**
 * Email Service
 * Sends transactional emails through Resend
 */

import { supabase } from "./supabase"

interface EmailOptions {
    email: string
    confirmationUrl: string
    userName?: string
}

export async function sendVerificationEmail(options: EmailOptions) {
    try {
          // Call Supabase Edge Function that uses Resend
      const { data, error } = await supabase.functions.invoke(
              "send-verification-email",
        {
                  body: {
                              email: options.email,
                              confirmationUrl: options.confirmationUrl,
                              userName: options.userName,
                  },
        }
            )

      if (error) {
              console.error("Failed to send verification email:", error)
              throw error
      }

      return data
    } catch (err) {
          console.error("Email service error:", err)
          throw err
    }
}

export async function sendPasswordResetEmail(email: string, resetUrl: string) {
    try {
          const { data, error } = await supabase.functions.invoke(
                  "send-password-reset-email",
            {
                      body: {
                                  email,
                                  resetUrl,
                      },
            }
                )

      if (error) throw error
          return data
    } catch (err) {
          console.error("Password reset email error:", err)
          throw err
    }
}
