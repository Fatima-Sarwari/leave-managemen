import cds from '@sap/cds';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { GET, POST, PATCH, expect } = cds.test(join(__dirname, '..'));

const as = (username) => ({ auth: { username, password: '' } });

const ANNA = 'anna.schmidt@novatech.com';
const PETER = 'peter.wagner@novatech.com';
const LAURA = 'laura.fischer@novatech.com';
const JOHN = 'john.miller@novatech.com';
const HR = 'hr.admin@novatech.com';

const ANNA_ID = '22222222-2222-2222-2222-222222222222';
const PETER_ID = '33333333-3333-3333-3333-333333333333';
const LAURA_ID = '44444444-4444-4444-4444-444444444444';

const ANNUAL = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SICK = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const ANNA_PENDING_ANNUAL = 'd1111111-0000-0000-0000-000000000001'; // 5 days
const PETER_APPROVED_SICK = 'd1111111-0000-0000-0000-000000000002'; // 2 days
const PETER_PENDING_UNPAID = 'd1111111-0000-0000-0000-000000000005'; // 3 days

async function balanceOf(employee_ID, leaveType_ID) {
  const { LeaveBalance } = cds.entities('com.novatech.leavemgmt');
  const balance = await SELECT.one.from(LeaveBalance).where({ employee_ID, leaveType_ID });
  return { ...balance, usedDays: Number(balance.usedDays), totalDays: Number(balance.totalDays) };
}

let lauraRequestId;

describe('Leave request business logic', () => {

  describe('FR-02: submission blocked when requested days exceed balance', () => {

    it('rejects a request that exceeds the remaining balance', async () => {
      // Anna: Sick balance is 10 total / 2 used -> 8 remaining. Ask for 9.
      let threw = false;
      try {
        await POST('/odata/v4/leave/MyLeaveRequests', {
          employee_ID: ANNA_ID,
          leaveType_ID: SICK,
          startDate: '2026-10-01',
          endDate: '2026-10-09', // 9 calendar days
        }, as(ANNA));
      } catch (err) {
        threw = true;
        expect(err.status).to.equal(400);
      }
      expect(threw).to.equal(true);
    });

    it('accepts a request within the remaining balance and auto-calculates days', async () => {
      // Laura: Annual balance is 25 total / 0 used -> plenty of room.
      const { data } = await POST('/odata/v4/leave/MyLeaveRequests', {
        employee_ID: LAURA_ID,
        leaveType_ID: ANNUAL,
        startDate: '2026-11-02',
        endDate: '2026-11-03', // 2 calendar days
      }, as(LAURA));

      expect(data.days).to.equal('2.0');
      expect(data.status).to.equal('Pending'); // forced, regardless of client input
      lauraRequestId = data.ID;
    });

  });

  describe('FR-03: balance deduction on approval', () => {

    it('deducts the approved days from the employee balance', async () => {
      const before = await balanceOf(ANNA_ID, ANNUAL);
      expect(before.usedDays).to.equal(0);

      const { data } = await PATCH(`/odata/v4/leave/TeamLeaveRequests(${ANNA_PENDING_ANNUAL})`,
        { status: 'Approved' }, as(JOHN));
      expect(data.status).to.equal('Approved');

      const after = await balanceOf(ANNA_ID, ANNUAL);
      expect(after.usedDays).to.equal(5); // 0 + 5-day request
    });

    it('does not deduct balance on rejection', async () => {
      const before = await balanceOf(LAURA_ID, ANNUAL);
      expect(before.usedDays).to.equal(0);

      const { data } = await PATCH(`/odata/v4/leave/TeamLeaveRequests(${lauraRequestId})`,
        { status: 'Rejected' }, as(JOHN));
      expect(data.status).to.equal('Rejected');

      const after = await balanceOf(LAURA_ID, ANNUAL);
      expect(after.usedDays).to.equal(0); // unchanged
    });

  });

  describe('FR-04: cancellation rules', () => {

    it('lets an employee cancel their own pending request', async () => {
      const { data } = await PATCH(`/odata/v4/leave/MyLeaveRequests(${PETER_PENDING_UNPAID})`,
        { status: 'Cancelled' }, as(PETER));
      expect(data.status).to.equal('Cancelled');
    });

    it('blocks an employee from cancelling an approved request', async () => {
      let threw = false;
      try {
        await PATCH(`/odata/v4/leave/MyLeaveRequests(${PETER_APPROVED_SICK})`,
          { status: 'Cancelled' }, as(PETER));
      } catch (err) {
        threw = true;
        expect(err.status).to.equal(403);
      }
      expect(threw).to.equal(true);

      const { data } = await GET(`/odata/v4/leave/MyLeaveRequests(${PETER_APPROVED_SICK})`, as(PETER));
      expect(data.status).to.equal('Approved'); // unchanged
    });

    it('lets HR Admin cancel an approved request and refunds the balance', async () => {
      const before = await balanceOf(PETER_ID, SICK);
      expect(before.usedDays).to.equal(2);

      const { data } = await PATCH(`/odata/v4/leave/AllLeaveRequests(${PETER_APPROVED_SICK})`,
        { status: 'Cancelled' }, as(HR));
      expect(data.status).to.equal('Cancelled');

      const after = await balanceOf(PETER_ID, SICK);
      expect(after.usedDays).to.equal(0); // 2-day request refunded
    });

  });

});
