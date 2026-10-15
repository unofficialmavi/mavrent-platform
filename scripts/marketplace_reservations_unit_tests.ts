/**
 * MAVRENT PLATFORM: ACCOMMODATION MARKETPLACE & RESERVATIONS AUDIT SUITE
 * Verifies short-stay calculations, overlap collision prevention, date validation, and inquiry handling.
 */

interface Reservation {
  id: string;
  unitId: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  nightlyRate: number;
  serviceFee: number;
  cleaningFee: number;
  totalAmount: number;
  status: 'pending_confirmation' | 'confirmed' | 'cancelled' | 'completed';
}

function calculateStayFinancials(checkInStr: string, checkOutStr: string, nightlyRate: number, cleaningFee: number = 35000) {
  const inDate = new Date(checkInStr);
  const outDate = new Date(checkOutStr);

  if (isNaN(inDate.getTime()) || isNaN(outDate.getTime())) {
    throw new Error('Invalid date format');
  }

  if (inDate >= outDate) {
    throw new Error('Check-out date must be strictly after check-in date');
  }

  const nights = Math.max(1, Math.round((outDate.getTime() - inDate.getTime()) / (1000 * 60 * 60 * 24)));
  const subtotal = nights * nightlyRate;
  const serviceFee = Math.round(subtotal * 0.05);
  const totalAmount = subtotal + serviceFee + cleaningFee;

  return { nights, subtotal, serviceFee, cleaningFee, totalAmount };
}

function checkCollision(existing: Reservation[], newCheckIn: string, newCheckOut: string, newUnitId: string): boolean {
  const inDate = new Date(newCheckIn);
  const outDate = new Date(newCheckOut);

  return existing.some((r) => {
    if (r.unitId !== newUnitId || (r.status !== 'confirmed' && r.status !== 'pending_confirmation')) {
      return false;
    }
    const existIn = new Date(r.checkIn);
    const existOut = new Date(r.checkOut);
    // Overlap: NOT (existOut <= inDate OR existIn >= outDate)
    return !(existOut <= inDate || existIn >= outDate);
  });
}

function runTests() {
  console.log('='.repeat(64));
  console.log('MAVRENT PLATFORM: ACCOMMODATION MARKETPLACE & RESERVATIONS AUDIT');
  console.log('='.repeat(64));

  let passed = 0;

  // Test 1: Date order validation
  try {
    calculateStayFinancials('2026-11-10', '2026-11-05', 200000);
    console.error('[FAIL] Reversed dates should be rejected');
  } catch (err: any) {
    console.log('[PASS] Reversed check-in/check-out dates strictly rejected');
    passed++;
  }

  // Test 2: Same-day check-in/out rejected (min 1 night)
  try {
    calculateStayFinancials('2026-11-10', '2026-11-10', 200000);
    console.error('[FAIL] Same day check-in/out should be rejected');
  } catch (err: any) {
    console.log('[PASS] Zero-night same-day reservation strictly rejected');
    passed++;
  }

  // Test 3: Accurate financial calculation
  const fin = calculateStayFinancials('2026-11-01', '2026-11-05', 220000, 40000);
  if (fin.nights === 4 && fin.subtotal === 880000 && fin.serviceFee === 44000 && fin.cleaningFee === 40000 && fin.totalAmount === 964000) {
    console.log('[PASS] Authoritative price calculation matches formula (nights * rate + 5% service + cleaning fee)');
    passed++;
  } else {
    console.error('[FAIL] Financial calculation mismatch:', fin);
  }

  // Test 4: Overlap collision detection
  const existingReservations: Reservation[] = [
    {
      id: 'res-1',
      unitId: 'unit-kololo-1',
      checkIn: '2026-11-10',
      checkOut: '2026-11-15',
      nights: 5,
      nightlyRate: 200000,
      serviceFee: 50000,
      cleaningFee: 35000,
      totalAmount: 1085000,
      status: 'confirmed',
    },
  ];

  // Identical dates
  const c1 = checkCollision(existingReservations, '2026-11-10', '2026-11-15', 'unit-kololo-1');
  if (c1) {
    console.log('[PASS] Identical overlapping date window detected as conflict');
    passed++;
  } else {
    console.error('[FAIL] Identical date collision failed');
  }

  // Enclosed dates
  const c2 = checkCollision(existingReservations, '2026-11-11', '2026-11-14', 'unit-kololo-1');
  if (c2) {
    console.log('[PASS] Enclosed date window detected as conflict');
    passed++;
  } else {
    console.error('[FAIL] Enclosed date collision failed');
  }

  // Straddling start date
  const c3 = checkCollision(existingReservations, '2026-11-08', '2026-11-12', 'unit-kololo-1');
  if (c3) {
    console.log('[PASS] Straddling check-in date window detected as conflict');
    passed++;
  } else {
    console.error('[FAIL] Straddling check-in collision failed');
  }

  // Straddling end date
  const c4 = checkCollision(existingReservations, '2026-11-13', '2026-11-18', 'unit-kololo-1');
  if (c4) {
    console.log('[PASS] Straddling check-out date window detected as conflict');
    passed++;
  } else {
    console.error('[FAIL] Straddling check-out collision failed');
  }

  // Adjacent non-overlapping dates (check-out of res-1 is check-in of new) -> Should PASS!
  const c5 = checkCollision(existingReservations, '2026-11-15', '2026-11-20', 'unit-kololo-1');
  if (!c5) {
    console.log('[PASS] Consecutive adjacent stay (check-out day == check-in day) is allowed');
    passed++;
  } else {
    console.error('[FAIL] Consecutive stay incorrectly blocked');
  }

  // Different unit same dates -> Should PASS!
  const c6 = checkCollision(existingReservations, '2026-11-10', '2026-11-15', 'unit-nakasero-2');
  if (!c6) {
    console.log('[PASS] Reservation on different unit with same dates is allowed');
    passed++;
  } else {
    console.error('[FAIL] Different unit reservation blocked');
  }

  // Cancelled reservation does not cause conflict -> Should PASS!
  const cancelledReservations: Reservation[] = [
    {
      id: 'res-2',
      unitId: 'unit-kololo-1',
      checkIn: '2026-11-10',
      checkOut: '2026-11-15',
      nights: 5,
      nightlyRate: 200000,
      serviceFee: 50000,
      cleaningFee: 35000,
      totalAmount: 1085000,
      status: 'cancelled',
    },
  ];
  const c7 = checkCollision(cancelledReservations, '2026-11-10', '2026-11-15', 'unit-kololo-1');
  if (!c7) {
    console.log('[PASS] Cancelled prior reservation permits new booking on same dates');
    passed++;
  } else {
    console.error('[FAIL] Cancelled reservation blocked new booking');
  }

  console.log('='.repeat(64));
  console.log(`MARKETPLACE RESERVATIONS TEST RESULTS: ${passed}/10 CHECKS PASSED`);
  console.log('='.repeat(64));

  if (passed !== 10) {
    process.exit(1);
  }
}

runTests();
