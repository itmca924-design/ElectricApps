/**
 * Master Company Profile Response Model
 * Backend ke CompanyProfileDto se match karta hai
 */
export interface CompanyProfileDto {
    id: number;
    name: string;
    tagline: string;
    registrationNumber: string;
    gstin: string; //
    logoUrl: string | null;
    primaryEmail: string;
    primaryPhone: string;
    website: string;
    message: string | null; // WhatsApp/SMS reminder message
    isActive: boolean;
    address: AddressDto; // Nested Object
    bankInfo: BankDetailDto; // Nested Object
    authorizedSignatories: AuthorizedSignatoryDto[];
}

/**
 * Authorized Signatory Model
 */
export interface AuthorizedSignatoryDto {
    id: number;
    personName: string;
    designation: string;
    signatureImageUrl: string | null;
    isDefault: boolean;
}

/**
 * Address Details Model
 */
export interface AddressDto {
    id: number;
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    stateCode: string; // e.g., "07"
    pinCode: string;
    country: string;
}

/**
 * Bank Account Details Model
 */
export interface BankDetailDto {
    id: number;
    bankName: string;
    branchName: string;
    accountNumber: string;
    ifscCode: string;
    accountType: string; // e.g., "Current" or "Savings"
}

/**
 * Create/Update Request Model
 * Backend ke UpsertCompanyRequest se match karta hai
 */
export interface UpsertCompanyRequest {
    name: string;
    tagline: string;
    registrationNumber: string;
    gstin: string;
    logoUrl: string | null;
    primaryEmail: string;
    primaryPhone: string;
    website: string;
    message: string | null; // WhatsApp/SMS reminder message
    address: AddressDto;
    bankInfo: BankDetailDto;
    authorizedSignatories: AuthorizedSignatoryDto[];
}
