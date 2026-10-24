CREATE SCHEMA IF NOT EXISTS "public";

CREATE TYPE "Role" AS ENUM ('CUSTOMER', 'ADMIN');

CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'ON_SALE', 'CANCELLED');

CREATE TYPE "SeatStatus" AS ENUM ('AVAILABLE', 'HELD', 'SOLD');

CREATE TYPE "OrderStatus" AS ENUM ('CONFIRMED', 'FAILED');

CREATE TYPE "PromoType" AS ENUM ('PERCENT', 'FIXED');

CREATE TYPE "TicketStatus" AS ENUM ('VALID', 'REVOKED', 'USED');

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CUSTOMER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Artist" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "bio" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "genre" TEXT NOT NULL,
    "imageAlt" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Artist_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Venue" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "timezone" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "doorsOpen" TIMESTAMP(3) NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "presentation" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Section" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "level" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Seat" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "row" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,

    CONSTRAINT "Seat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventSeat" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "seatId" TEXT NOT NULL,
    "status" "SeatStatus" NOT NULL DEFAULT 'AVAILABLE',
    "price" INTEGER NOT NULL,

    CONSTRAINT "EventSeat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SeatHold" (
    "id" TEXT NOT NULL,
    "eventSeatId" TEXT NOT NULL,
    "userId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeatHold_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "fees" INTEGER NOT NULL,
    "tax" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "discount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "eventSeatId" TEXT NOT NULL,
    "price" INTEGER NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "ticketCode" TEXT NOT NULL,
    "qrCode" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'VALID',

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PromoCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "PromoType" NOT NULL,
    "value" INTEGER NOT NULL,
    "minimum" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Extra" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "unit" TEXT NOT NULL,
    "maxQuantity" INTEGER NOT NULL,
    "presentation" JSONB NOT NULL,

    CONSTRAINT "Extra_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Favorite" (
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("userId","eventId")
);

CREATE TABLE "OutboxJob" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboxJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

CREATE INDEX "Session_userId_idx" ON "Session"("userId");

CREATE UNIQUE INDEX "Artist_slug_key" ON "Artist"("slug");

CREATE INDEX "Event_status_date_idx" ON "Event"("status", "date");

CREATE INDEX "Event_artistId_idx" ON "Event"("artistId");

CREATE INDEX "Event_venueId_idx" ON "Event"("venueId");

CREATE UNIQUE INDEX "Section_venueId_label_key" ON "Section"("venueId", "label");

CREATE UNIQUE INDEX "Seat_sectionId_row_number_key" ON "Seat"("sectionId", "row", "number");

CREATE INDEX "EventSeat_eventId_status_idx" ON "EventSeat"("eventId", "status");

CREATE UNIQUE INDEX "EventSeat_eventId_seatId_key" ON "EventSeat"("eventId", "seatId");

CREATE UNIQUE INDEX "SeatHold_eventSeatId_key" ON "SeatHold"("eventSeatId");

CREATE INDEX "SeatHold_expiresAt_idx" ON "SeatHold"("expiresAt");

CREATE INDEX "SeatHold_userId_idx" ON "SeatHold"("userId");

CREATE INDEX "Order_userId_createdAt_idx" ON "Order"("userId", "createdAt");

CREATE INDEX "Order_eventId_idx" ON "Order"("eventId");

CREATE UNIQUE INDEX "Order_userId_idempotencyKey_key" ON "Order"("userId", "idempotencyKey");

CREATE UNIQUE INDEX "OrderItem_eventSeatId_key" ON "OrderItem"("eventSeatId");

CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

CREATE UNIQUE INDEX "Ticket_orderItemId_key" ON "Ticket"("orderItemId");

CREATE UNIQUE INDEX "Ticket_ticketCode_key" ON "Ticket"("ticketCode");

CREATE UNIQUE INDEX "Ticket_qrCode_key" ON "Ticket"("qrCode");

CREATE UNIQUE INDEX "Payment_orderId_key" ON "Payment"("orderId");

CREATE UNIQUE INDEX "Payment_transactionId_key" ON "Payment"("transactionId");

CREATE UNIQUE INDEX "PromoCode_code_key" ON "PromoCode"("code");

CREATE INDEX "Favorite_eventId_idx" ON "Favorite"("eventId");

CREATE UNIQUE INDEX "OutboxJob_orderId_key" ON "OutboxJob"("orderId");

CREATE INDEX "OutboxJob_status_availableAt_idx" ON "OutboxJob"("status", "availableAt");

ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Event" ADD CONSTRAINT "Event_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Event" ADD CONSTRAINT "Event_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Section" ADD CONSTRAINT "Section_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Seat" ADD CONSTRAINT "Seat_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EventSeat" ADD CONSTRAINT "EventSeat_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EventSeat" ADD CONSTRAINT "EventSeat_seatId_fkey" FOREIGN KEY ("seatId") REFERENCES "Seat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SeatHold" ADD CONSTRAINT "SeatHold_eventSeatId_fkey" FOREIGN KEY ("eventSeatId") REFERENCES "EventSeat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SeatHold" ADD CONSTRAINT "SeatHold_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Order" ADD CONSTRAINT "Order_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_eventSeatId_fkey" FOREIGN KEY ("eventSeatId") REFERENCES "EventSeat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OutboxJob" ADD CONSTRAINT "OutboxJob_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EventSeat" ADD CONSTRAINT event_seat_price_nonnegative CHECK (price >= 0);
ALTER TABLE "Seat" ADD CONSTRAINT seat_coordinates_positive CHECK (row > 0 AND number > 0);
ALTER TABLE "Section" ADD CONSTRAINT section_capacity_positive CHECK (capacity > 0);
ALTER TABLE "Venue" ADD CONSTRAINT venue_capacity_positive CHECK (capacity > 0);
ALTER TABLE "Event" ADD CONSTRAINT event_doors_before_start CHECK ("doorsOpen" <= date);
ALTER TABLE "Order" ADD CONSTRAINT order_money_balanced CHECK (subtotal >= 0 AND fees >= 0 AND tax >= 0 AND discount >= 0 AND discount <= subtotal AND total = subtotal - discount + fees + tax);
ALTER TABLE "OrderItem" ADD CONSTRAINT order_item_price_nonnegative CHECK (price >= 0);
ALTER TABLE "Payment" ADD CONSTRAINT payment_amount_nonnegative CHECK (amount >= 0);
ALTER TABLE "Extra" ADD CONSTRAINT extra_limits CHECK (price >= 0 AND "maxQuantity" > 0);
ALTER TABLE "PromoCode" ADD CONSTRAINT promo_limits CHECK (value >= 0 AND minimum >= 0 AND (type <> 'PERCENT' OR value <= 100));
CREATE FUNCTION check_inventory_venue() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM "Seat" seat JOIN "Section" s ON s.id=seat."sectionId" JOIN "Event" e ON e."venueId"=s."venueId" WHERE seat.id=NEW."seatId" AND e.id=NEW."eventId") THEN
 RAISE EXCEPTION 'Seat and event venue mismatch' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER inventory_venue BEFORE INSERT OR UPDATE OF "eventId","seatId" ON "EventSeat" FOR EACH ROW EXECUTE FUNCTION check_inventory_venue();
CREATE FUNCTION check_order_item_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM "Order" o JOIN "EventSeat" e ON e."eventId"=o."eventId" WHERE o.id=NEW."orderId" AND e.id=NEW."eventSeatId" AND o.status='CONFIRMED') THEN
 RAISE EXCEPTION 'Order and inventory event mismatch' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER order_inventory_event BEFORE INSERT OR UPDATE ON "OrderItem" FOR EACH ROW EXECUTE FUNCTION check_order_item_event();
