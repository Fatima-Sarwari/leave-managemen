using com.novatech.leavemgmt as db from '../db/schema';

/**
 * NFR-02: role-based authorization enforced here at the service layer (not only in the UI),
 * via @requires (role check) + @restrict where-clauses (row-level filtering) on $user.
 *
 * @requires/@restrict target the XSUAA *scope* names (Employee/Manager/HRAdmin) from section 7's
 * authorization concept table — the JWT's scope claim is what CAP checks at runtime. The matching
 * BTP *role collections* (LeaveEmployee/LeaveManager/LeaveHRAdmin) that business users get assigned
 * to are defined in xs-security.json, one level up: role collection -> role template -> scope.
 */
service LeaveService {

  // FR-01/02/04: Employee — CRUD on own leave requests only.
  @restrict: [
    { grant: ['READ', 'CREATE', 'UPDATE', 'DELETE'], to: 'Employee', where: 'employee.email = $user' }
  ]
  entity MyLeaveRequests as projection on db.LeaveRequest;

  // FR-03/06: Manager — read and approve/reject direct reports' requests (team calendar).
  @restrict: [
    { grant: ['READ', 'UPDATE'], to: 'Manager', where: 'employee.manager.email = $user' }
  ]
  entity TeamLeaveRequests as projection on db.LeaveRequest;

  // FR-07: HR Admin — full read/write across all leave requests company-wide.
  @requires: 'HRAdmin'
  entity AllLeaveRequests as projection on db.LeaveRequest;

  // Read-only lookup: display text + value help for the employee association below.
  // `leaveRequests`/`leaveBalances` are excluded — LeaveRequest is projected three times in this
  // service (MyLeaveRequests/TeamLeaveRequests/AllLeaveRequests), so a back-association here would
  // be an ambiguous redirection target, and this lookup entity doesn't need that navigation anyway.
  @readonly @requires: 'HRAdmin'
  entity Employees  as projection on db.Employee excluding { leaveRequests, leaveBalances };

  // FR-05: HR Admin maintains leave types as master data — full CRUD, not just a value-help lookup.
  @requires: 'HRAdmin'
  entity LeaveTypes as projection on db.LeaveType excluding { leaveRequests, leaveBalances };

}

////////////////////////////////////////////////////////////////////////////
//
//  Fiori UI: leave-request-manage — List Report / Object Page (section 5)
//  Annotated once on the shared db entity so MyLeaveRequests, TeamLeaveRequests
//  and AllLeaveRequests all inherit the same list columns and object page fields.
//
////////////////////////////////////////////////////////////////////////////

annotate db.LeaveRequest with @(
  UI: {
    SelectionFields: [ status, leaveType_ID ],
    LineItem: [
      { Value: employee.name,  Label: '{i18n>Employee}' },
      { Value: leaveType.name, Label: '{i18n>LeaveType}' },
      { Value: startDate,      Label: '{i18n>StartDate}' },
      { Value: endDate,        Label: '{i18n>EndDate}' },
      { Value: days,           Label: '{i18n>Days}' },
      { Value: status,         Label: '{i18n>Status}' },
    ],
    HeaderInfo: {
      TypeName      : '{i18n>LeaveRequest}',
      TypeNamePlural: '{i18n>LeaveRequests}',
      Title         : { Value: employee.name },
      Description   : { Value: leaveType.name }
    },
    Facets: [
      { $Type: 'UI.ReferenceFacet', Label: '{i18n>General}', Target: '@UI.FieldGroup#General' },
      { $Type: 'UI.ReferenceFacet', Label: '{i18n>Audit}',   Target: '@UI.FieldGroup#Audit' },
    ],
    FieldGroup #General: {
      Data: [
        { Value: employee_ID },
        { Value: leaveType_ID },
        { Value: startDate },
        { Value: endDate },
        { Value: days },
        { Value: status },
      ]
    },
    FieldGroup #Audit: {
      Data: [
        { Value: createdBy },
        { Value: createdAt },
        { Value: modifiedBy },
        { Value: modifiedAt },
      ]
    }
  }
) {
  employee_ID  @title: '{i18n>Employee}';
  leaveType_ID @title: '{i18n>LeaveType}';
  employee     @Common: { Text: employee.name,  TextArrangement: #TextOnly } @ValueList.entity: 'Employees';
  leaveType    @Common: { Text: leaveType.name, TextArrangement: #TextOnly } @ValueList.entity: 'LeaveTypes';
  startDate    @title: '{i18n>StartDate}';
  endDate      @title: '{i18n>EndDate}';
  days         @title: '{i18n>Days}';
  status       @title: '{i18n>Status}';
};
