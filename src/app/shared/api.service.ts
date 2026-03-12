import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../enviornments/environment';
import { GridRequest } from './models/grid-request.model';

@Injectable({ providedIn: 'root' })
export class ApiService {
    public environment = environment;

    constructor(public http: HttpClient) { }

    post<T>(url: string, body: any, baseUrl: string = environment.ApiBaseUrl): Observable<T> {
        return this.http.post<T>(url ? `${baseUrl}/${url}` : baseUrl, body);
    }

    put<T>(url: string, body: any, baseUrl: string = environment.ApiBaseUrl): Observable<T> {
        return this.http.put<T>(url ? `${baseUrl}/${url}` : baseUrl, body);
    }

    patch<T>(url: string, body: any, baseUrl: string = environment.ApiBaseUrl): Observable<T> {
        return this.http.patch<T>(url ? `${baseUrl}/${url}` : baseUrl, body);
    }

    delete<T>(url: string, baseUrl: string = environment.ApiBaseUrl): Observable<T> {
        return this.http.delete<T>(url ? `${baseUrl}/${url}` : baseUrl);
    }

    get<T>(url: string, baseUrl: string = environment.ApiBaseUrl): Observable<T> {
        return this.http.get<T>(url ? `${baseUrl}/${url}` : baseUrl);
    }

    getBlob(url: string, baseUrl: string = environment.ApiBaseUrl): Observable<Blob> {
        return this.http.get(`${baseUrl}/${url}`, { responseType: 'blob' });
    }

    postBlob(url: string, body: any, baseUrl: string = environment.ApiBaseUrl): Observable<Blob> {
        return this.http.post(`${baseUrl}/${url}`, body, { responseType: 'blob' });
    }

    /**
     * Helper to convert GridRequest to QueryString
     */
    toQueryString(request: any): string {
        const query: string[] = [];
        Object.keys(request).forEach(key => {
            const value = request[key];
            // Skip undefined, null, and empty string values
            // For booleans, only include if true (skip false) to avoid backend parsing issues
            if (value !== undefined && value !== null && value !== '') {
                // Special handling for booleans: only include if true
                if (typeof value === 'boolean') {
                    if (value === true) {
                        query.push(`${key}=true`);
                    }
                    // Skip false booleans to let backend default to false
                    return;
                }
                
                if (typeof value === 'object') {
                    Object.keys(value).forEach(subKey => {
                        const subValue = value[subKey];
                        if (subValue !== undefined && subValue !== null && subValue !== '') {
                            query.push(`${key}[${encodeURIComponent(subKey)}]=${encodeURIComponent(subValue)}`);
                        }
                    });
                } else {
                    query.push(`${key}=${encodeURIComponent(value)}`);
                }
            }
        });
        return query.join('&');
    }

}
