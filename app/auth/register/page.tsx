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

  async function handleRegister(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault();
  setErrorMessage(null);

  console.log("Register start");

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  console.log("SignUp data:", data);
  console.log("SignUp error:", error);

  if (error) {
    setErrorMessage(error.message || JSON.stringify(error));
    return;
  }

  if (!data.user) {
    setErrorMessage("User was not created.");
    return;
  }

  if (!data.session) {
    setErrorMessage(
      "Account created but no session. Please confirm email or disable email confirmation."
    );
    return;
  }

  console.log("Create profile start");

  const profileResult = await createProfileForCurrentUser({
    display_name: displayName,
  }).catch((profileError) => {
    console.log("Create profile error:", profileError);

    setErrorMessage(
      profileError?.message ||
        profileError?.error_description ||
        profileError?.details ||
        JSON.stringify(profileError)
    );

    return null;
  });

  if (!profileResult) {
    return;
  }

  console.log("Create profile success");

  router.push("/consent");
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
