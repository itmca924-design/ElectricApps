import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { OverlayContainer } from '@angular/cdk/overlay';

@Injectable({
    providedIn: 'root'
})
export class ThemeService {
    private overlayContainer = inject(OverlayContainer);
    private darkMode = new BehaviorSubject<boolean>(this.getInitialDarkMode());
    private activeTheme = new BehaviorSubject<string>(this.getInitialTheme());
    private direction = new BehaviorSubject<'ltr' | 'rtl'>(this.getInitialDirection());

    darkMode$ = this.darkMode.asObservable();
    activeTheme$ = this.activeTheme.asObservable();
    direction$ = this.direction.asObservable();

    availableThemes = [
        { name: 'azure-blue', label: 'Azure & Blue', color: '#007fff' },
        { name: 'rose-red', label: 'Rose & Red', color: '#f50057' },
        { name: 'green-orange', label: 'Green & Orange', color: '#00c853' },
        { name: 'magenta-violet', label: 'Magenta & Violet', color: '#d500f9' },
        { name: 'cyan-orange', label: 'Cyan & Orange', color: '#00bcd4' },
        { name: 'orange-amber', label: 'Orange & Amber', color: '#ff9800' },
        { name: 'indigo-pink', label: 'Indigo & Pink', color: '#3f51b5' },
        { name: 'teal-lime', label: 'Teal & Lime', color: '#009688' },
        { name: 'deep-purple', label: 'Deep Purple & Blue', color: '#673ab7' },
        { name: 'spring-green', label: 'Spring Green & Azure', color: '#00e676' },
    ];

    constructor() {
        this.applyTheme(this.activeTheme.value, this.darkMode.value, this.direction.value);
    }

    setTheme(themeName: string) {
        if (this.availableThemes.find(t => t.name === themeName)) {
            this.activeTheme.next(themeName);
            localStorage.setItem('active-theme', themeName);
            this.applyTheme(themeName, this.darkMode.value, this.direction.value);
        }
    }

    toggleDarkMode() {
        const newMode = !this.darkMode.value;
        this.darkMode.next(newMode);
        localStorage.setItem('dark-mode', newMode ? 'true' : 'false');
        this.applyTheme(this.activeTheme.value, newMode, this.direction.value);
    }

    toggleDirection() {
        const newDirection = this.direction.value === 'ltr' ? 'rtl' : 'ltr';
        this.direction.next(newDirection);
        localStorage.setItem('app-direction', newDirection);
        this.applyTheme(this.activeTheme.value, this.darkMode.value, newDirection);
    }

    private getInitialDarkMode(): boolean {
        const savedMode = localStorage.getItem('dark-mode');
        if (savedMode) {
            return savedMode === 'true';
        }
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    private getInitialTheme(): string {
        return localStorage.getItem('active-theme') || 'azure-blue';
    }

    private getInitialDirection(): 'ltr' | 'rtl' {
        return (localStorage.getItem('app-direction') as 'ltr' | 'rtl') || 'ltr';
    }

    private applyTheme(theme: string, isDark: boolean, direction: 'ltr' | 'rtl') {
        console.log(`Applying theme: ${theme}, Dark Mode: ${isDark}, Direction: ${direction}`);
        const root = document.documentElement;
        root.setAttribute('dir', direction); // Critical for LTR/RTL switching
        const overlay = this.overlayContainer.getContainerElement();
        overlay.setAttribute('dir', direction); // Ensure dialogs follow direction

        // Remove previous theme classes
        this.availableThemes.forEach(t => {
            root.classList.remove(`theme-${t.name}`);
            overlay.classList.remove(`theme-${t.name}`);
        });
        root.classList.remove('dark-mode');
        overlay.classList.remove('dark-mode');

        // Add new classes
        root.classList.add(`theme-${theme}`);
        overlay.classList.add(`theme-${theme}`);

        if (isDark) {
            root.classList.add('dark-mode');
            overlay.classList.add('dark-mode');
        }
    }
}
