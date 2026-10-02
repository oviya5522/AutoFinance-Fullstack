import { getCustomers, getCustomerById } from "./customerStorage";
import { apiGet, apiPost, apiPut, notifyDataUpdated } from "./api";
import {
  getRepaymentBuckets,
  getScheduleRemainingAmount,
  getSchedulePaidAmount,
  getOutstandingPenaltySummary,
} from "./repaymentStorage";
import { getVehicleById } from "./vehicleStorage";

export const DEFAULT_RELOAN_RULES = {
  minimumPaidInstallmentPercentage: 75,
  maximumOverdueAmount: 5000,
  maximumOverdueDays: 30,
  allowActiveLoan: true,
  allowClosedLoan: true,
  allowForeclosedLoan: false,
  allowSeizedVehicle: false,
  allowSoldVehicle: false,
  requireCustomerVerification: true,
  requireDocuments: true,
};

const normalize = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const roundMoney = (value) =>
  Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;

const startOfDay = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
};

const getLoanStatus = (loan) => normalize(loan?.status || "active");

const getPreviousLoanStatusEvaluation = (loan, rules) => {
  const status = getLoanStatus(loan);

  const normalizedStatus = status
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const openStatuses = [
    "active",
    "partially paid",
    "partial",
    "pending",
    "due",
    "overdue",
    "in repayment",
    "repayment",
  ];

  const completedStatuses = ["closed", "paid", "settled", "completed"];

  const blockedStatuses = [
    "foreclosed",
    "sold",
    "invalid",
    "cancelled",
    "canceled",
  ];

  if (blockedStatuses.includes(normalizedStatus)) {
    return {
      allowed:
        normalizedStatus === "foreclosed" ? rules.allowForeclosedLoan : false,
      currentValue:
        normalizedStatus === "foreclosed"
          ? "Foreclosed"
          : loan?.status || "Unknown",
      message:
        normalizedStatus === "foreclosed"
          ? rules.allowForeclosedLoan
            ? "Foreclosed loans are allowed by the current rules"
            : "Foreclosed loans are not allowed"
          : "This terminal loan state is not eligible",
    };
  }

  if (openStatuses.includes(normalizedStatus)) {
    const isPartial =
      normalizedStatus === "partially paid" || normalizedStatus === "partial";

    return {
      allowed: rules.allowActiveLoan,
      currentValue: isPartial
        ? "Partially Paid / Active"
        : loan?.status || "Active",
      message: isPartial
        ? "Partially paid loans are allowed because the previous loan remains an active/open repayment relationship."
        : "Open repayment loans are allowed by the current rules",
    };
  }

  if (completedStatuses.includes(normalizedStatus)) {
    return {
      allowed: rules.allowClosedLoan,
      currentValue: loan?.status || "Closed",
      message: rules.allowClosedLoan
        ? "Completed loans are allowed by the current rules"
        : "Completed loans are not allowed by the current rules",
    };
  }

  return {
    allowed: false,
    currentValue: loan?.status || "Unknown",
    message:
      "The previous loan status is not recognized as an eligible repayment state",
  };
};

const getLoanVehicle = (loan, vehicle) => vehicle || loan?.vehicle || {};

const getVehicleStatus = (vehicle) => normalize(vehicle?.status || "active");

const getPaidInstallmentCount = (loan) =>
  Array.isArray(loan?.repaymentSchedule)
    ? loan.repaymentSchedule.filter(
        (row) =>
          getScheduleRemainingAmount(row) <= 0 ||
          normalize(row?.status) === "paid",
      ).length
    : 0;

export const getRepaymentHistoryEligibility = (
  loan,
  rules = getReLoanRules(),
) => {
  const schedule = Array.isArray(loan?.repaymentSchedule)
    ? loan.repaymentSchedule
    : [];

  const totalScheduledInstallments = schedule.length;

  const fullyPaidInstallments = getPaidInstallmentCount(loan);

  const completionPercentage = toNumber(rules.minimumPaidInstallmentPercentage);

  const requiredPaidInstallments = Math.ceil(
    totalScheduledInstallments * (completionPercentage / 100),
  );

  return {
    totalScheduledInstallments,
    fullyPaidInstallments,
    requiredPaidInstallments,
    completionPercentage,
    passes: fullyPaidInstallments >= requiredPaidInstallments,
  };
};

const getOverdueMetrics = (loan, referenceDate = new Date()) => {
  const today = startOfDay(referenceDate);
  const buckets = getRepaymentBuckets(loan, referenceDate);
  const overdueAmount = roundMoney(
    buckets.overdue.reduce(
      (total, row) => total + getScheduleRemainingAmount(row),
      0,
    ),
  );
  const overdueDays = buckets.overdue.reduce((maximum, row) => {
    const due = startOfDay(row?.dueDate);
    if (!due || !today) return maximum;
    const days = Math.max(
      0,
      Math.floor((today.getTime() - due.getTime()) / 86400000),
    );
    return Math.max(maximum, days);
  }, 0);

  return {
    overdueAmount,
    overdueDays,
    overdueCount: buckets.overdue.length,
  };
};

export const getReLoanRules = async () => {
  try {
    return { ...DEFAULT_RELOAN_RULES, ...(await apiGet("/reloan/rules")) };
  } catch (error) {
    console.error("Failed to load re-loan rules:", error);

    return { ...DEFAULT_RELOAN_RULES };
  }
};

export const saveReLoanRules = async (rules = {}) => {
  const saved = await apiPut("/reloan/rules", rules);

  notifyDataUpdated();

  return saved;
};

export const getCustomerLoans = (customerRecord) => {
  const loans = Array.isArray(customerRecord?.loans)
    ? customerRecord.loans
    : [];
  const legacyLoan = customerRecord?.loan;
  const all = legacyLoan ? [legacyLoan, ...loans] : loans;
  const seen = new Set();
  return all.filter((loan) => {
    const key = String(loan?.id || loan?.loanNumber || "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const getCustomerReLoans = async (customerId) => {
  const customer = await getCustomerById(customerId);
  return getCustomerLoans(customer).filter((loan) =>
    Boolean(
      loan?.previousLoanId ||
      loan?.previousLoanNumber ||
      loan?.previousLoanReference,
    ),
  );
};

export const hasActiveReLoan = async (customerId) => {
  const reLoans = await getCustomerReLoans(customerId);

  return reLoans.some((loan) => {
    const status = getLoanStatus(loan);
    return ["active", "pending", "due", "overdue", "partially_paid"].includes(
      status,
    );
  });
};

const checkCustomerVerification = (customer, rules) => {
  const personal = customer?.customer?.personal || {};
  const complete = Boolean(
    personal?.name &&
    (personal?.mobileNumber || personal?.alternateMobileNumber) &&
    (personal?.address || personal?.area),
  );
  return {
    id: "customerVerification",
    label: "Customer Verification",
    status: rules.requireCustomerVerification
      ? complete
        ? "pass"
        : "pending"
      : "pass",
    currentValue: complete ? "Complete" : "Incomplete",
    requiredValue: rules.requireCustomerVerification
      ? "Complete"
      : "Not required",
    message: complete
      ? "Customer information is complete"
      : "Required customer information is incomplete",
  };
};

const checkDocuments = (customer, rules) => {
  const kyc = customer?.customer?.kyc || {};
  const documents = customer?.customer?.documents || {};
  const selectedTypes = Array.isArray(documents.selectedTypes)
    ? documents.selectedTypes
    : [];
  const complete =
    Boolean(
      kyc.aadhaarNumber ||
      kyc.drivingLicenceNumber ||
      kyc.panNumber ||
      kyc.voterIdNumber,
    ) && selectedTypes.length >= Number(documents.requiredMinimum || 0);
  return {
    id: "requiredDocuments",
    label: "Required Documents",
    status: rules.requireDocuments ? (complete ? "pass" : "pending") : "pass",
    currentValue: complete ? "Complete" : "Pending Verification",
    requiredValue: rules.requireDocuments ? "Complete" : "Not required",
    message: complete
      ? "Required documents are complete"
      : "Required documents need verification",
  };
};

export const calculateReLoanFinancialSummary = (loan) => {
  const schedule = Array.isArray(loan?.repaymentSchedule)
    ? loan.repaymentSchedule
    : [];
  const buckets = getRepaymentBuckets(loan);
  const penalty = getOutstandingPenaltySummary(loan);
  const outstanding = roundMoney(
    schedule.reduce((total, row) => total + getScheduleRemainingAmount(row), 0),
  );
  const paidAmount = roundMoney(
    schedule.reduce((total, row) => total + getSchedulePaidAmount(row), 0),
  );
  return {
    originalLoanAmount: roundMoney(loan?.loanAmount),
    amountPaid: paidAmount,
    principalOutstanding: roundMoney(
      schedule.reduce(
        (total, row) => total + toNumber(row?.remainingPrincipal),
        0,
      ),
    ),
    interestOutstanding: roundMoney(
      schedule.reduce(
        (total, row) => total + toNumber(row?.remainingInterest),
        0,
      ),
    ),
    currentOverdue: roundMoney(
      buckets.overdue.reduce(
        (total, row) => total + getScheduleRemainingAmount(row),
        0,
      ),
    ),
    penalty: roundMoney(penalty?.amount),
    totalOutstanding: outstanding,
    installmentsPaid: getPaidInstallmentCount(loan),
    totalInstallments: schedule.length,
    remainingInstallments: schedule.filter(
      (row) => getScheduleRemainingAmount(row) > 0,
    ).length,
  };
};

export const checkReLoanEligibility = async ({
  customer,
  loan,
  vehicle,
  rules = getReLoanRules(),
} = {}) => {
  const activeRules = { ...getReLoanRules(), ...rules };
  const metrics = getOverdueMetrics(loan);
  const vehicleRecord = getLoanVehicle(loan, vehicle);
  const vehicleStatus = getVehicleStatus(vehicleRecord);
  const customerId = customer?.customer?.id || loan?.customerId || "";
  const previousLoanStatus = getPreviousLoanStatusEvaluation(loan, activeRules);
  const repaymentHistory = getRepaymentHistoryEligibility(loan, activeRules);
  const vehicleAllowed =
    vehicleStatus === "active" ||
    vehicleStatus === "released" ||
    (vehicleStatus === "seized" && activeRules.allowSeizedVehicle) ||
    (vehicleStatus === "sold" && activeRules.allowSoldVehicle);
  const checks = [
    {
      id: "repaymentHistory",
      label: "Repayment History",
      status: repaymentHistory.passes ? "pass" : "fail",
      currentValue: repaymentHistory.fullyPaidInstallments,
      requiredValue: repaymentHistory.requiredPaidInstallments,
      totalScheduledInstallments: repaymentHistory.totalScheduledInstallments,
      fullyPaidInstallments: repaymentHistory.fullyPaidInstallments,
      requiredPaidInstallments: repaymentHistory.requiredPaidInstallments,
      completionPercentage: repaymentHistory.completionPercentage,
      message: `${repaymentHistory.fullyPaidInstallments} / ${repaymentHistory.totalScheduledInstallments} installments fully paid. Required: ${repaymentHistory.requiredPaidInstallments} installments. Required completion: ${repaymentHistory.completionPercentage}%`,
    },
    {
      id: "overdueAmount",
      label: "Overdue Amount",
      status:
        metrics.overdueAmount <= activeRules.maximumOverdueAmount
          ? "pass"
          : "fail",
      currentValue: metrics.overdueAmount,
      requiredValue: activeRules.maximumOverdueAmount,
      message: `₹${metrics.overdueAmount} / ₹${activeRules.maximumOverdueAmount} allowed`,
    },
    {
      id: "overdueDays",
      label: "Overdue Days",
      status:
        metrics.overdueDays <= activeRules.maximumOverdueDays ? "pass" : "fail",
      currentValue: metrics.overdueDays,
      requiredValue: activeRules.maximumOverdueDays,
      message: `${metrics.overdueDays} / ${activeRules.maximumOverdueDays} days`,
    },
    {
      id: "previousLoanStatus",
      label: "Previous Loan Status",
      status: previousLoanStatus.allowed ? "pass" : "fail",
      currentValue: previousLoanStatus.currentValue,
      requiredValue: "Allowed status",
      message: previousLoanStatus.message,
    },
    {
      id: "vehicleStatus",
      label: "Vehicle Status",
      status: vehicleAllowed ? "pass" : "fail",
      currentValue: vehicleRecord?.status || "Unknown",
      requiredValue: "Allowed vehicle",
      message: vehicleAllowed
        ? "Vehicle is eligible"
        : "Vehicle status is not eligible",
    },
    {
      id: "existingReLoan",
      label: "Existing Active Re-loan",
      status: (await hasActiveReLoan(customerId)) ? "fail" : "pass",
      currentValue: (await hasActiveReLoan(customerId))
        ? "Active re-loan exists"
        : "None",
      requiredValue: "None",
      message: (await hasActiveReLoan(customerId))
        ? "Customer already has an active re-loan"
        : "No active re-loan",
    },
    checkCustomerVerification(customer, activeRules),
    checkDocuments(customer, activeRules),
  ];
  const failedChecks = checks.filter((check) => check.status === "fail");
  const pendingChecks = checks.filter((check) => check.status === "pending");
  const eligible = failedChecks.length === 0 && pendingChecks.length === 0;
  return {
    eligible,
    status: failedChecks.length
      ? "NOT_ELIGIBLE"
      : pendingChecks.length
        ? "PENDING_VERIFICATION"
        : "ELIGIBLE",
    checks,
    failedChecks,
    pendingChecks,
    financialSummary: calculateReLoanFinancialSummary(loan),
    customerId,
    loanId: loan?.id || loan?.loanNumber || "",
    checkedAt: new Date().toISOString(),
  };
};

export const saveReLoanEligibility = async (result) => {
  const saved = await apiPost("/reloan/eligibility", result);

  notifyDataUpdated();

  return saved;
};

/**
 * Most recent eligibility check recorded for a loan.
 */
export const getReLoanEligibility = async (loanId) => {
  try {
    const checks = await apiGet(
      `/reloan/eligibility?loanId=${encodeURIComponent(loanId || "")}`,
    );

    return Array.isArray(checks) ? checks[0] || null : null;
  } catch (error) {
    console.error("Failed to load re-loan eligibility:", error);

    return null;
  }
};

export const createReLoanContext = ({ customer, loan, vehicleId } = {}) => ({
  type: "reloan",
  customerId: customer?.customer?.id || loan?.customerId || "",
  previousLoanId: loan?.id || "",
  previousLoanNumber: loan?.loanNumber || "",
  previousVehicleId: loan?.vehicleId || loan?.vehicle?.id || "",
  vehicleId: vehicleId || loan?.vehicleId || loan?.vehicle?.id || "",
  collateralVehicleMode: "same",
});

export const findCustomerAndLoan = async (loanId) => {
  const customers = await getCustomers();
  for (const customer of customers) {
    const loans = getCustomerLoans(customer);
    const loan = loans.find(
      (item) => String(item?.id || item?.loanNumber) === String(loanId),
    );
    if (loan) {
      return {
        customer,
        loan,
        vehicle:
          getVehicleById(loan?.vehicleId) ||
          customer?.vehicle ||
          loan?.vehicle ||
          {},
      };
    }
  }
  return null;
};
