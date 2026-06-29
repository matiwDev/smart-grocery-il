import { NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import CredentialsProvider from "next-auth/providers/credentials"

// Extend NextAuth types to support the custom membershipTier property
declare module "next-auth" {
  interface Session {
    user?: {
      name?: string | null
      email?: string | null
      image?: string | null
      membershipTier?: string
    }
  }
  interface User {
    membershipTier?: string
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    membershipTier?: string
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.AUTH_GOOGLE_ID || "",
      clientSecret: process.env.AUTH_GOOGLE_SECRET || "",
    }),
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        // Mock authorization for easy testing and sign-in
        if (credentials?.email && credentials?.password) {
          const passwordStr = credentials.password as string;
          if (passwordStr.length >= 4) {
            return {
              id: "mock-user-id",
              name: credentials.email.split("@")[0],
              email: credentials.email,
              membershipTier: "Premium",
            }
          }
        }
        return null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.membershipTier = (user as any).membershipTier || "Premium";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).membershipTier = (token.membershipTier as string) || "Premium";
      }
      return session;
    },
  },
  secret: process.env.AUTH_SECRET,
}
