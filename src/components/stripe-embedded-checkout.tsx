import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { getStripe } from "@/lib/stripe";

interface Props {
  clientSecret: string;
}

export function StripeEmbeddedCheckout({ clientSecret }: Props) {
  const fetchClientSecret = async (): Promise<string> => clientSecret;
  return (
    <div id="checkout">
      <EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}