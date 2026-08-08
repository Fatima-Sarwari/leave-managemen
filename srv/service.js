import cds from '@sap/cds';

const { LeaveBalance } = cds.entities('com.novatech.leavemgmt');

function daysBetween(startDate, endDate) {
  const ms = new Date(endDate) - new Date(startDate);
  return Math.floor(ms / 86400000) + 1;
}

async function adjustUsedDays(employee_ID, leaveType_ID, delta) {
  const balance = await SELECT.one.from(LeaveBalance).where({ employee_ID, leaveType_ID });
  if (!balance) return;
  const usedDays = Math.max(0, Number(balance.usedDays) + delta);
  await UPDATE(LeaveBalance).set({ usedDays }).where({ ID: balance.ID });
}

export default class LeaveService extends cds.ApplicationService {
  async init() {
    const { MyLeaveRequests, TeamLeaveRequests, AllLeaveRequests } = this.entities;

    // FR-01: auto-calculate days requested from start/end dates on submission.
    this.before('CREATE', [MyLeaveRequests, AllLeaveRequests], (req) => {
      const { startDate, endDate } = req.data;
      if (!startDate || !endDate) return;
      if (new Date(endDate) < new Date(startDate)) {
        return req.reject(400, 'End date must not be before start date');
      }
      req.data.days = daysBetween(startDate, endDate);
    });

    // FR-02: employee submissions go straight to Pending and are blocked if they
    // exceed the employee's remaining balance for that leave type.
    this.before('CREATE', MyLeaveRequests, async (req) => {
      req.data.status = 'Pending';
      const { employee_ID, leaveType_ID, days } = req.data;
      const balance = await SELECT.one.from(LeaveBalance).where({ employee_ID, leaveType_ID });
      const remaining = balance ? Number(balance.totalDays) - Number(balance.usedDays) : 0;
      if (days > remaining) {
        return req.reject(400, `Requested ${days} day(s) exceed remaining balance of ${remaining} for this leave type`);
      }
    });

    // FR-04: employees may cancel their own Pending requests; an Approved request
    // requires HR Admin intervention (handled below on AllLeaveRequests).
    this.before('UPDATE', MyLeaveRequests, async (req) => {
      if (req.data.status !== 'Cancelled') return;
      const current = await SELECT.one.from(MyLeaveRequests).where({ ID: req.data.ID });
      if (current && current.status !== 'Pending' && current.status !== 'Draft') {
        return req.reject(403, 'Cancelling an approved leave request requires HR Admin intervention');
      }
    });

    // FR-03: manager may only approve/reject a Pending request; approval deducts balance.
    this.before('UPDATE', TeamLeaveRequests, async (req) => {
      if (!req.data.status) return;
      const current = await SELECT.one.from(TeamLeaveRequests).where({ ID: req.data.ID });
      if (!current) return req.reject(404, 'Leave request not found');
      if (current.status !== 'Pending' || !['Approved', 'Rejected'].includes(req.data.status)) {
        return req.reject(400, `Cannot change status from ${current.status} to ${req.data.status}`);
      }
      if (req.data.status === 'Approved') {
        await adjustUsedDays(current.employee_ID, current.leaveType_ID, Number(current.days));
      }
    });

    // HR Admin: full read/write; cancelling a previously Approved request refunds the balance.
    this.before('UPDATE', AllLeaveRequests, async (req) => {
      if (!req.data.status) return;
      const current = await SELECT.one.from(AllLeaveRequests).where({ ID: req.data.ID });
      if (!current) return;
      if (req.data.status === 'Approved' && current.status !== 'Approved') {
        await adjustUsedDays(current.employee_ID, current.leaveType_ID, Number(current.days));
      }
      if (req.data.status === 'Cancelled' && current.status === 'Approved') {
        await adjustUsedDays(current.employee_ID, current.leaveType_ID, -Number(current.days));
      }
    });

    return super.init();
  }
}
