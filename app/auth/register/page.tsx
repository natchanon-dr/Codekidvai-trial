"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
import { createProfileForCurrentUser } from "@/services/profile-service";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    try {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      await createProfileForCurrentUser({ display_name: displayName });
      router.push("/consent");
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "Register failed.");
    }
  }

  return <main style={{ maxWidth: 480, margin: "40px auto", padding: 24 }}>
    <h1>Register</h1>
    <form onSubmit={handleRegister}>
      <input placeholder="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} style={{ width: "100%", padding: 8, marginBottom: 8 }} />
      <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: "100%", padding: 8, marginBottom: 8 }} />
      <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: "100%", padding: 8, marginBottom: 8 }} />
      {errorMessage && <p style={{ color: "red" }}>{errorMessage}</p>}
      <button type="submit">Register</button>
    </form>
  </main>;
}
