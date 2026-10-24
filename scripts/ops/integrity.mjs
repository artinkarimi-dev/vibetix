import { pathToFileURL } from "node:url";
import { verifyMigrationState } from "./migration-state.mjs";
import { connect } from "./database.mjs";
export async function inspectIntegrity(query) {
  const rows = await query(`SELECT
    (SELECT count(*) FROM "EventSeat" s LEFT JOIN "OrderItem" i ON i."eventSeatId"=s.id LEFT JOIN "Order" o ON o.id=i."orderId" WHERE s.status='SOLD' AND (i.id IS NULL OR o.status<>'CONFIRMED'))::int AS sold_orphans,
    (SELECT count(*) FROM "Order" WHERE total<>subtotal-discount+fees+tax OR total<0 OR discount<0 OR discount>subtotal)::int AS unbalanced_orders,
    (SELECT count(*) FROM "Order" o LEFT JOIN "Payment" p ON p."orderId"=o.id WHERE p.id IS NULL OR p.amount<>o.total OR (o.status='CONFIRMED' AND p.status<>'SUCCEEDED') OR (o.status='FAILED' AND p.status<>'FAILED'))::int AS invalid_payments,
    (SELECT count(*) FROM "Order" o WHERE (o.snapshot#>>'{totals,grandTotal}')::bigint IS DISTINCT FROM o.total::bigint OR (o.snapshot#>>'{totals,discount}')::bigint IS DISTINCT FROM o.discount::bigint OR (o.snapshot#>>'{totals,tax}')::bigint IS DISTINCT FROM o.tax::bigint OR ((o.snapshot#>>'{totals,serviceFee}')::bigint+(o.snapshot#>>'{totals,processingFee}')::bigint) IS DISTINCT FROM o.fees::bigint OR ((o.snapshot#>>'{totals,ticketSubtotal}')::bigint+(o.snapshot#>>'{totals,extrasSubtotal}')::bigint) IS DISTINCT FROM o.subtotal::bigint OR o.snapshot#>>'{totals,currency}' IS DISTINCT FROM o.currency)::int AS snapshot_money_mismatch,
    (SELECT count(*) FROM "Order" o WHERE o.status='CONFIRMED' AND ((SELECT coalesce(sum(i.price),0) FROM "OrderItem" i WHERE i."orderId"=o.id) IS DISTINCT FROM (o.snapshot#>>'{totals,ticketSubtotal}')::bigint OR (SELECT coalesce(sum((x->>'quantity')::bigint*(x->>'unitPriceCents')::bigint),0) FROM jsonb_array_elements(o.snapshot->'extras') x) IS DISTINCT FROM (o.snapshot#>>'{totals,extrasSubtotal}')::bigint))::int AS line_item_money_mismatch,
    (SELECT count(*) FROM "Ticket" t LEFT JOIN "OrderItem" i ON i.id=t."orderItemId" LEFT JOIN "Order" o ON o.id=i."orderId" WHERE i.id IS NULL OR o.id IS NULL OR o.status<>'CONFIRMED')::int AS invalid_tickets,
    (SELECT count(*) FROM "Order" o WHERE o.status='CONFIRMED' AND NOT EXISTS(SELECT 1 FROM "OrderItem" i WHERE i."orderId"=o.id))::int AS empty_confirmed_orders,
    (SELECT count(*) FROM "OrderItem" i JOIN "Order" o ON o.id=i."orderId" JOIN "EventSeat" s ON s.id=i."eventSeatId" LEFT JOIN "Ticket" t ON t."orderItemId"=i.id WHERE o.status<>'CONFIRMED' OR s.status<>'SOLD' OR s."eventId"<>o."eventId" OR t.id IS NULL)::int AS invalid_order_items,
    (SELECT count(*) FROM "SeatHold" h JOIN "EventSeat" s ON s.id=h."eventSeatId" WHERE s.status<>'HELD' OR h."userId" IS NULL)::int AS invalid_holds,
    (SELECT count(*) FROM "EventSeat" s WHERE s.status='HELD' AND NOT EXISTS(SELECT 1 FROM "SeatHold" h WHERE h."eventSeatId"=s.id))::int AS missing_holds,
    (SELECT count(*) FROM "EventSeat" s JOIN "Event" e ON e.id=s."eventId" JOIN "Seat" seat ON seat.id=s."seatId" JOIN "Section" section ON section.id=seat."sectionId" WHERE section."venueId"<>e."venueId" OR s.price<0)::int AS invalid_inventory,
    (SELECT count(*) FROM (SELECT "eventSeatId" FROM "OrderItem" GROUP BY "eventSeatId" HAVING count(*)>1) duplicates)::int AS duplicate_sales,
    (SELECT count(*) FROM (SELECT "orderItemId" FROM "Ticket" GROUP BY "orderItemId" HAVING count(*)>1) duplicates)::int AS duplicate_tickets,
    (SELECT count(*) FROM "OutboxJob" j JOIN "Order" o ON o.id=j."orderId" WHERE o.status<>'CONFIRMED' OR j.attempts<0)::int AS invalid_jobs`);
  const counts = rows[0];
  if (!counts || Object.values(counts).some((n) => n !== 0))
    throw new Error("Database business integrity check failed.");
  return counts;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  let db;
  try {
    db = await connect("INTEGRITY_DATABASE_URL");
    await db.query("BEGIN READ ONLY");
    await db.query("SET LOCAL statement_timeout='15s'");
    const migrations = await verifyMigrationState(
      async (sql) => (await db.query(sql)).rows,
    );
    console.info(
      JSON.stringify({
        passed: true,
        migrations,
        violations: await inspectIntegrity(
          async (sql) => (await db.query(sql)).rows,
        ),
      }),
    );
    await db.query("COMMIT");
  } catch {
    console.error("Integrity check failed; no connection or row data printed.");
    process.exitCode = 1;
  } finally {
    await db?.end();
  }
}
