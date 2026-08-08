using { cuid, managed } from '@sap/cds/common';

namespace com.novatech.leavemgmt;

/**
 * Local employee master data (out of scope: live SAP HCM integration).
 * Self-referencing manager association models the org hierarchy.
 */
entity Employee : cuid, managed {
  name          : String(100)  @mandatory;
  email         : String(255)  @mandatory;
  manager       : Association to Employee;                                  // managerID (self-reference)
  reports       : Association to many Employee     on reports.manager = $self;       // Employee 1—many Employee (manages)
  leaveRequests : Association to many LeaveRequest  on leaveRequests.employee = $self; // Employee 1—many LeaveRequest (submits)
  leaveBalances : Association to many LeaveBalance  on leaveBalances.employee = $self; // Employee 1—many LeaveBalance (has)
}

/**
 * HR-maintained master data for leave categories (FR-05).
 */
entity LeaveType : cuid, managed {
  name             : String(100)  @mandatory;
  requiresApproval : Boolean default true;
  leaveRequests    : Association to many LeaveRequest  on leaveRequests.leaveType = $self; // LeaveType 1—many LeaveRequest (classifies)
  leaveBalances    : Association to many LeaveBalance  on leaveBalances.leaveType = $self;  // LeaveType 1—many LeaveBalance (tracks)
}

/**
 * A single leave request submitted by an employee (FR-01, FR-03, FR-04, FR-08).
 */
entity LeaveRequest : cuid, managed {
  employee  : Association to Employee   @mandatory; // employeeID
  leaveType : Association to LeaveType  @mandatory; // leaveTypeID
  startDate : Date @mandatory;
  endDate   : Date @mandatory;
  days      : Decimal(5,1);
  status    : String(9) enum {
    Draft;
    Pending;
    Approved;
    Rejected;
    Cancelled;
  } default 'Draft';
}

/**
 * Stateful running total of an employee's leave balance per leave type (FR-02, FR-07).
 */
entity LeaveBalance : cuid, managed {
  employee  : Association to Employee   @mandatory; // employeeID
  leaveType : Association to LeaveType  @mandatory; // leaveTypeID
  totalDays : Decimal(5,1) default 0;
  usedDays  : Decimal(5,1) default 0;
}
