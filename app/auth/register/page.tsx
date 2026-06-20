"use client";

import { useState } from "react";
import Link from "next/link";
import { dbClient } from "@/lib/db-client";

export default function RegisterPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function registerWithEmail(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");

    if (!fullName || !email || !password || !confirmPassword) {
      setMessage("กรุณากรอกข้อมูลให้ครบ");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("รหัสผ่านไม่ตรงกัน");
      return;
    }

    setLoading(true);

    const { error } = await dbClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role: "student",
        },
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    });

    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("สมัครสำเร็จ กรุณาตรวจสอบอีเมลเพื่อยืนยันบัญชี");
  }

  async function registerWithGoogle() {
    setMessage("ระบบสมัครด้วย Google จะเปิดใช้ภายหลัง");

    // เปิดใช้ภายหลังเมื่อ config Google Provider ใน Supabase แล้ว
    // const { error } = await dbClient.auth.signInWithOAuth({
    //   provider: "google",
    //   options: {
    //     redirectTo: `${window.location.origin}/dashboard`,
    //   },
    // });
    //
    // if (error) setMessage(error.message);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <form
        onSubmit={registerWithEmail}
        className="w-full max-w-md space-y-4 rounded-xl border bg-white p-6 shadow-sm"
      >
        <div>
          <h1 className="text-2xl font-bold">สมัครสมาชิก CodeKidVai</h1>
          <p className="text-sm text-gray-500">
            สร้างบัญชีผู้เรียนเพื่อเริ่มใช้งานระบบ
          </p>
        </div>

        <button
          type="button"
          onClick={registerWithGoogle}
          disabled
          className="w-full rounded border p-2 text-gray-400"
        >
          สมัครด้วย Google (เปิดใช้ภายหลัง)
        </button>

        <div className="text-center text-sm text-gray-500">หรือ</div>

        <input
          className="w-full rounded border p-2"
          placeholder="ชื่อ-นามสกุล"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />

        <input
          className="w-full rounded border p-2"
          placeholder="อีเมล"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          className="w-full rounded border p-2"
          placeholder="รหัสผ่าน"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <input
          className="w-full rounded border p-2"
          placeholder="ยืนยันรหัสผ่าน"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-black p-2 text-white disabled:bg-gray-400"
        >
          {loading ? "กำลังสมัคร..." : "สมัครด้วย Email"}
        </button>

        {message && <p className="text-sm text-red-600">{message}</p>}

        <p className="text-center text-sm">
          มีบัญชีแล้ว?{" "}
          <Link href="/login" className="font-medium underline">
            เข้าสู่ระบบ
          </Link>
        </p>
      </form>
    </main>
  );
}