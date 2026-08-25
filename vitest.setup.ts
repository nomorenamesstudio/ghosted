import dotenv from "dotenv";
import "@testing-library/jest-dom/vitest";

dotenv.config({ path: ".env" });

// Tests must never send real emails: force the sendEmail dev-log fallback.
delete process.env.RESEND_API_KEY;
