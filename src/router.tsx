import { lazy, Suspense } from "react";
import type { ReactElement } from "react";
import { createBrowserRouter } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { EventPage } from "./pages/EventPage";
import { BookingGuard } from "./components/booking/BookingGuard";
import { EmptyState } from "./components/common/EmptyState";
const AccountPage = lazy(() => import("./pages/AccountPage"));
const SeatsPage = lazy(() => import("./pages/SeatsPage"));
const ExtrasPage = lazy(() => import("./pages/ExtrasPage"));
const ReviewPage = lazy(() => import("./pages/ReviewPage"));
const CheckoutPage = lazy(() => import("./pages/CheckoutPage"));
const ConfirmationPage = lazy(() => import("./pages/ConfirmationPage"));
const TicketsPage = lazy(() => import("./pages/TicketsPage"));
const OrderPage = lazy(() => import("./pages/OrderPage"));
const DiscoveryPage = lazy(() => import("./pages/DiscoveryPage"));
const DetailPage = lazy(() => import("./pages/DetailPage"));
const InfoPage = lazy(() => import("./pages/InfoPage"));
const load = (element: ReactElement) => (
  <Suspense
    fallback={
      <div className="route-loading" role="status">
        Preparing your next moment…
      </div>
    }
  >
    {element}
  </Suspense>
);
export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    errorElement: (
      <EmptyState
        title="We couldn’t open that page"
        description="Please return to the event lineup and try again."
      />
    ),
    children: [
      { index: true, element: <EventPage /> },
      { path: "events/:eventId", element: <EventPage /> },
      { path: "account", element: load(<AccountPage />) },
      { path: "events", element: load(<DiscoveryPage />) },
      { path: "artists", element: load(<DiscoveryPage kind="artists" />) },
      { path: "venues", element: load(<DiscoveryPage kind="venues" />) },
      { path: "favorites", element: load(<DiscoveryPage kind="favorites" />) },
      { path: "artists/:artistId", element: load(<DetailPage />) },
      { path: "venues/:venueId", element: load(<DetailPage />) },
      { path: "seats", element: load(<SeatsPage />) },
      {
        element: <BookingGuard />,
        children: [
          { path: "extras", element: load(<ExtrasPage />) },
          { path: "review", element: load(<ReviewPage />) },
          { path: "checkout", element: load(<CheckoutPage />) },
        ],
      },
      { path: "confirmation", element: load(<ConfirmationPage />) },
      { path: "tickets", element: load(<TicketsPage />) },
      { path: "orders/:orderId", element: load(<OrderPage />) },
      ...["about", "terms", "privacy"].map((path) => ({
        path,
        element: load(<InfoPage />),
      })),
      {
        path: "*",
        element: (
          <EmptyState
            title="This page missed the encore"
            description="We can’t find that link. Explore the lineup and start a new night."
          />
        ),
      },
    ],
  },
]);
