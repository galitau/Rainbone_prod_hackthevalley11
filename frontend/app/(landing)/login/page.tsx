import { redirect } from "next/navigation";

// There is no account to log in to: anyone who types /login gets the guest pass.
export default function Login() {
  redirect("/enter");
}
