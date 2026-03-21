export interface LoginDto {
    Email: string;
    Password: string;
}

export interface User {
    id: string;
    userName: string;
    email: string;
    isActive: boolean;
    roles: string[];
    createdAt: string;
}

export interface RegisterUserDto {
    UserName: string;
    Email: string;
    Password: string;
    RoleIds: number[];
}