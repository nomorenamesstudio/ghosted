import { redirect } from "next/navigation";
import { registrationOpen } from "@/lib/config/flags";
import { RegisterForm } from "./register-form";

/**
 * The form only exists where sign-ups are open. Hiding the link is courtesy;
 * this is the page, and the API refuses as well (`REGISTRATION_CLOSED`) — three
 * layers, because the flag is a promise about who can get in.
 */
export default function RegisterPage() {
  if (!registrationOpen()) redirect("/login");

  return <RegisterForm />;
}
