import { accountRevision, accountIsCurrent } from "../api/authScope";
import { FIXTURE_MODE } from "../api/client";
import { purchase } from "../api/bookingApi";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  LockKeyhole,
  Smartphone,
  Mail,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import { checkoutSchema } from "../utils/checkoutValidation";
import type { CheckoutValues } from "../utils/checkoutValidation";
import { useBookingStore, getBookingSeats } from "../store/bookingStore";
import { useOrderStore } from "../store/orderStore";
import { createMockOrder } from "../services/orders";
import { useBooking } from "../utils/useBooking";
import { formatMoney } from "../utils/pricing";
import { BookingSteps } from "../components/booking/BookingSteps";
import { BookingSummary } from "../components/booking/BookingSummary";
import { PromoForm } from "../components/booking/PromoForm";
const paymentDelay = Math.max(
  200,
  Math.min(3000, Number(import.meta.env.VITE_PAYMENT_DELAY_MS) || 900),
);
export default function CheckoutPage() {
  const navigate = useNavigate();
  const { totals, authoritative, quoteError } = useBooking();
  const delivery = useBookingStore((s) => s.deliveryMethod);
  const setDelivery = useBookingStore((s) => s.setDelivery);
  const [paymentError, setPaymentError] = useState("");
  const submitting = useRef(false);
  const mounted = useRef(false);
  const checkoutKey = useRef<{ signature: string; key: string } | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CheckoutValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      fullName: useBookingStore.getState().attendee?.fullName ?? "",
      email: useBookingStore.getState().attendee?.email ?? "",
      phone: useBookingStore.getState().attendee?.phone ?? "",
      consent: false,
    },
    shouldUnregister: true,
  });
  const submit = handleSubmit(async (values) => {
    if (submitting.current) return;
    const revision = accountRevision();
    submitting.current = true;
    setPaymentError("");
    try {
      const initial = useBookingStore.getState();
      const quote = (state: typeof initial) =>
        JSON.stringify([
          state.eventId,
          state.selectedSeats,
          state.selectedExtras,
          state.promoCode,
          state.deliveryMethod,
          state.seatHoldExpiresAt,
        ]);
      const initialQuote = quote(initial);
      if (!initial.seatHoldExpiresAt || initial.seatHoldExpiresAt <= Date.now())
        throw new Error("Your seat hold expired. Select your seats again.");
      if (FIXTURE_MODE)
        await new Promise((resolve) => setTimeout(resolve, paymentDelay));

      if (!mounted.current) return;
      if (import.meta.env.VITE_PAYMENT_FAILURE === "true")
        throw new Error(
          "The simulated payment failed. No order was created. Please try again.",
        );
      const state = useBookingStore.getState();
      if (quote(state) !== initialQuote)
        throw new Error(
          "Your selection changed during processing. Review it and try again.",
        );
      const attendee = {
        fullName: values.fullName,
        email: values.email,
        phone: values.phone,
      };
      const signature = JSON.stringify([initialQuote, attendee]);
      if (checkoutKey.current?.signature !== signature)
        checkoutKey.current = { signature, key: crypto.randomUUID() };
      const order = FIXTURE_MODE
        ? createMockOrder(state, getBookingSeats(state), attendee)
        : (await purchase(attendee, checkoutKey.current!.key)).order;
      if (!mounted.current || (!FIXTURE_MODE && !accountIsCurrent(revision)))
        return;
      useOrderStore.getState().saveOrder(order);
      navigate(`/confirmation?order=${encodeURIComponent(order.id)}`, {
        replace: true,
        // Leave the guarded route before clearing its required seat state.
        flushSync: true,
      });
      state.completeBooking(order.id);
    } catch (error) {
      setPaymentError(
        error instanceof Error
          ? error.message
          : "Payment simulation could not complete. Try again.",
      );
    } finally {
      submitting.current = false;
    }
  });
  const fieldError = (name: keyof CheckoutValues) =>
    errors[name] ? (
      <p className="field-error" id={`${name}-error`} role="alert">
        {errors[name]?.message}
      </p>
    ) : null;
  const fieldProps = (name: keyof CheckoutValues) => ({
    "aria-labelledby": `${name}-label`,
    "aria-invalid": Boolean(errors[name]),
    "aria-describedby": errors[name] ? `${name}-error` : undefined,
  });
  return (
    <div className="flow-page">
      <BookingSteps step={3} />
      <div className="flow-title">
        <div>
          <span className="eyebrow">YOU’RE ALMOST THERE</span>
          <h1>
            The last step before the first note<span>.</span>
          </h1>
          <p>Your seats, your extras, your unforgettable night.</p>
        </div>
        <span className="flow-meta">
          <LockKeyhole size={14} />
          Test checkout
        </span>
      </div>
      <div className="checkout-warning" role="note">
        <ShieldCheck size={20} />
        <div>
          <strong>Test purchase only — no money will be charged.</strong>
          <p>
            No card information is requested or processed. Use fictional contact
            details. Your demo order reserves fictional inventory only; tickets
            have no admission value. Prices and fees are illustrative.
          </p>
        </div>
      </div>
      <div className="flow-grid">
        <div>
          <form
            id="checkout-form"
            className="checkout-form"
            onSubmit={submit}
            noValidate
          >
            <section className="panel form-panel">
              <h2>1. Your details</h2>
              <div className="form-grid">
                <label className="full-width">
                  <span id="fullName-label">Full Name</span>
                  <input
                    autoComplete="name"
                    {...register("fullName")}
                    {...fieldProps("fullName")}
                    placeholder="Alex Fan"
                  />
                  {fieldError("fullName")}
                </label>
                <label>
                  <span id="email-label">Email</span>
                  <input
                    type="email"
                    autoComplete="email"
                    {...register("email")}
                    {...fieldProps("email")}
                    placeholder="alex@example.com"
                  />
                  {fieldError("email")}
                </label>
                <label>
                  <span id="phone-label">Phone</span>
                  <input
                    type="tel"
                    autoComplete="tel"
                    {...register("phone")}
                    {...fieldProps("phone")}
                    placeholder="+1 212 555 0100"
                  />
                  {fieldError("phone")}
                </label>
              </div>
            </section>
            <section className="panel form-panel">
              <h2>2. Ticket delivery</h2>
              <div className="delivery-options">
                <label className={delivery === "mobile" ? "selected" : ""}>
                  <input
                    type="radio"
                    name="delivery"
                    checked={delivery === "mobile"}
                    onChange={() => setDelivery("mobile")}
                  />
                  <Smartphone size={20} />
                  <span>
                    <strong>Mobile Tickets</strong>
                    <small>Keep them in My Tickets</small>
                  </span>
                </label>
                <label className={delivery === "email" ? "selected" : ""}>
                  <input
                    type="radio"
                    name="delivery"
                    checked={delivery === "email"}
                    onChange={() => setDelivery("email")}
                  />
                  <Mail size={20} />
                  <span>
                    <strong>Email Tickets</strong>
                    <small>Simulated delivery preference</small>
                  </span>
                </label>
              </div>
              <p className="muted">
                {FIXTURE_MODE
                  ? "Tickets are saved in this browser. Email delivery is simulated."
                  : "Orders are saved to your account. Email delivery requires a configured transport."}
              </p>
            </section>
            <section className="panel form-panel">
              <h2>3. Simulated payment</h2>
              <p>
                No card, wallet, bank account, or payment provider is connected.
                Confirm below to demonstrate server-authoritative pricing and
                atomic demo ticket creation.
              </p>
            </section>
            <section className="panel form-panel">
              <label className="consent-label">
                <input
                  type="checkbox"
                  {...register("consent")}
                  {...fieldProps("consent")}
                />
                <span id="consent-label">
                  I understand this is a simulated purchase, creates no real
                  {FIXTURE_MODE ? "reservation" : "admission entitlement"}, and
                  charges no money.
                </span>
              </label>
              {fieldError("consent")}
              {paymentError && (
                <p className="inline-alert" role="alert">
                  {paymentError}
                </p>
              )}
              <button
                className="button button-primary pay-button"
                type="submit"
                disabled={isSubmitting || !authoritative || Boolean(quoteError)}
              >
                {isSubmitting
                  ? "Processing test purchase…"
                  : `Complete Test Purchase · ${formatMoney(totals.grandTotal)}`}
                <ArrowRight size={17} />
              </button>
              <p className="simulation-note">
                This demonstration never charges money or creates venue
                admission rights.
              </p>
            </section>
          </form>
          <section className="panel form-panel">
            <PromoForm />
          </section>
        </div>
        <BookingSummary showPrices />
      </div>
    </div>
  );
}
