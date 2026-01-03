import { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import prisma from "./prisma";
import { isEmailFree } from "./free-emails";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as any,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email et mot de passe requis");
        }
        
        const user = await prisma.user.findUnique({ 
          where: { email: credentials.email } 
        });
        
        if (!user || !user.password) {
          throw new Error("Compte introuvable");
        }
        
        const valid = await bcrypt.compare(credentials.password, user.password);
        if (!valid) {
          throw new Error("Mot de passe incorrect");
        }
        
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      
      if (token.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { subscriptionStatus: true, email: true },
        });
        
        const isFree = isEmailFree(dbUser?.email);
        token.subscriptionStatus = isFree ? "active" : (dbUser?.subscriptionStatus || "inactive");
        token.isFree = isFree;
      }
      
      return token;
    },
    async session({ session, token }) {
      if (session.user && token) {
        (session.user as any).id = token.id;
        (session.user as any).subscriptionStatus = token.subscriptionStatus;
        (session.user as any).isFree = token.isFree;
      }
      return session;
    },
  },
};
