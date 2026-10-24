import { FIXTURE_MODE } from "../../api/client";
import { post } from "../../api/client";
import { selection } from "../../api/bookingApi";
import { useState } from "react";
import { Tag, X } from "lucide-react";
import { useBookingStore } from "../../store/bookingStore";
export function PromoForm() {
  const applied = useBookingStore((s) => s.promoCode);
  const applyPromo = useBookingStore((s) => s.applyPromo);
  const [value, setValue] = useState(applied);
  const [message, setMessage] = useState("");
  const [invalid, setInvalid] = useState(false);
  return (
    <div className="promo-box">
      <label htmlFor="promo-code">
        <Tag size={13} />
        Promo code
      </label>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!FIXTURE_MODE) {
            try {
              await post("/quotes", {
                ...selection(),
                promo: value.trim().toUpperCase(),
              });
              useBookingStore.setState({
                promoCode: value.trim().toUpperCase(),
              });
              setInvalid(false);
              setMessage("Server promo applied.");
            } catch (e) {
              setInvalid(true);
              setMessage((e as Error).message);
            }
            return;
          }
          const result = applyPromo(value);
          setInvalid(!result.valid);
          setMessage(result.message);
        }}
      >
        <input
          id="promo-code"
          value={value}
          maxLength={30}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. VIBETIX10"
          aria-invalid={invalid}
          aria-describedby={message ? "promo-message" : undefined}
        />
        <button className="button button-secondary" type="submit">
          Apply
        </button>
      </form>
      {message && (
        <p
          id="promo-message"
          role={invalid ? "alert" : "status"}
          className={invalid ? "field-error" : "field-success"}
        >
          {message}
        </p>
      )}
      {applied && (
        <button
          className="remove-promo"
          onClick={() => {
            applyPromo("");
            setValue("");
            setMessage("Promo removed.");
            setInvalid(false);
          }}
        >
          Remove {applied}
          <X size={12} />
        </button>
      )}
      <small>Demo codes: VIBETIX10, WELCOME15, ECHOES25.</small>
    </div>
  );
}
