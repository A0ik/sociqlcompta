import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, name } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email et mot de passe requis" },
        { status: 400 }
      );
    }

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) {
      return NextResponse.json(
        { error: "Cet email est déjà utilisé" },
        { status: 400 }
      );
    }

    const hashed = await bcrypt.hash(password, 12);
    
    await prisma.user.create({
      data: {
        email,
        password: hashed,
        name: name || email.split("@")[0],
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}
