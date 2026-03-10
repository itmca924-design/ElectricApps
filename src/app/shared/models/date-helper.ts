export class DateHelper {
  // Payload ke liye (Object -> String)
  static toLocalISOString(date: any): string | null {
    if (!date) return null;
    const d = new Date(date);
    if (isNaN(d.getTime())) return null;
    const year = d.getFullYear();
    const month = ('0' + (d.getMonth() + 1)).slice(-2);
    const day = ('0' + d.getDate()).slice(-2);
    return `${year}-${month}-${day}`;
  }

  // Display ke liye (dd-mm-yyyy)
  static toDisplayDate(date: any): string | null {
    if (!date) return null;
    const d = new Date(date);
    if (isNaN(d.getTime())) return null;
    const day = ('0' + d.getDate()).slice(-2);
    const month = ('0' + (d.getMonth() + 1)).slice(-2);
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  }

  // Short Display ke liye (dd-mm-yy)
  static toShortDisplayDate(date: any): string | null {
    if (!date) return null;
    const d = new Date(date);
    if (isNaN(d.getTime())) return null;
    const day = ('0' + d.getDate()).slice(-2);
    const month = ('0' + (d.getMonth() + 1)).slice(-2);
    const year = d.getFullYear().toString().slice(-2);
    return `${day}-${month}-${year}`;
  }

  /**
   * Parse dd-mm-yy or dd-mm-yyyy to valid .NET DateTime compatible ISO string
   * returns: yyyy-mm-ddT00:00:00.000Z
   */
  static parseToISO(dateStr: string): string | null {
    if (!dateStr || typeof dateStr !== 'string') return null;
    if (dateStr === 'NA') return null;
    
    const parts = dateStr.split('-');
    if (parts.length !== 3) return null;

    let day = parseInt(parts[0], 10);
    let month = parseInt(parts[1], 10) - 1; // 0-indexed
    let year = parseInt(parts[2], 10);

    if (year < 100) {
      year += 2000;
    }

    // Use UTC to avoid timezone shifts during save
    const d = new Date(Date.UTC(year, month, day, 0, 0, 0));
    if (isNaN(d.getTime())) return null;
    
    return d.toISOString();
  }

  // Fetch ke liye (String -> Date Object)
  static toDateObject(dateStr: any): Date | null {
    if (!dateStr) return null;
    return new Date(dateStr); 
  }
}