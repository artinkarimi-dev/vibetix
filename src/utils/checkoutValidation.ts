import { z } from "zod";
export const checkoutSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, "Enter your full name.")
      .max(100, "Name is too long."),
    email: z.email("Enter a valid email address.").max(254),
    phone: z
      .string()
      .trim()
      .refine(
        (value) =>
          /^\+?[\d\s().-]{7,25}$/.test(value) &&
          value.replace(/\D/g, "").length >= 7,
        "Enter a valid phone number.",
      ),
    consent: z
      .boolean()
      .refine(Boolean, "Confirm that you understand this is a test purchase."),
  })
  .strict();
export type CheckoutValues = z.infer<typeof checkoutSchema>;
