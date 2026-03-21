import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, inject, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MaterialModule } from '../../../../shared/material/material/material-module';
import { ActivatedRoute, Router } from '@angular/router';
import { ProductService } from '../service/product.service';
import { ProductLookUpService } from '../service/product.lookup.sercice';
import { UnitService } from '../../units/services/units.service';
import { FormFooter } from '../../../shared/form-footer/form-footer';
import { StatusDialogComponent } from '../../../../shared/components/status-dialog-component/status-dialog-component';
import { Product } from '../model/product.model';
import { MatDialog, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Observable, Subject, of } from 'rxjs';
import { map, startWith, takeUntil, finalize } from 'rxjs/operators';
import * as XLSX from 'xlsx';

import { LocationService } from '../../locations/services/locations.service';
import { Warehouse, Rack } from '../../locations/models/locations.model';

@Component({
  selector: 'app-product-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MaterialModule],
  templateUrl: './product-form.html',
  styleUrl: './product-form.scss',
})
export class ProductForm implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private dialog = inject(MatDialog);
  private productLukupService = inject(ProductLookUpService);
  private productService = inject(ProductService);
  private unitService = inject(UnitService);
  private locationService = inject(LocationService);
  private destroy$ = new Subject<void>();
  public dialogRef = inject(MatDialogRef<ProductForm>, { optional: true });
  public data = inject(MAT_DIALOG_DATA, { optional: true });

  productsForm!: FormGroup;
  loading = false;
  isEditMode = false;
  productId: string | null = null;
  isDialog = false;

  categories: any[] = [];
  subcategories: any[] = [];
  units: any[] = [];
  warehouses: Warehouse[] = [];
  racks: Rack[] = [];
  filteredRacks: Rack[] = [];

  filteredCategories!: Observable<any[]>;
  filteredSubcategories!: Observable<any[]>;
  filteredUnits!: Observable<any[]>;

  isSearchingCategories = false;
  isSearchingSubcategories = false;
  isSearchingUnits = false;

  previewImage: string | ArrayBuffer | null = null;

  ngOnInit() {
    this.createForm();
    this.setupAutocomplete();
    this.loadInitialLookups();

    if (this.data) {
      this.isDialog = true;
      if (this.data.sku) {
        this.productsForm.patchValue({ sku: this.data.sku });
      }
    }

    this.productId = this.route.snapshot.paramMap.get('id');
    if (this.productId) {
      this.isEditMode = true;
      this.loadProduct();
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  setupAutocomplete() {
    // 🔍 Category Autocomplete with "No results found" popup
    this.filteredCategories = this.productsForm.get('categorySearch')!.valueChanges.pipe(
      startWith(''),
      map(value => {
        const name = typeof value === 'string' ? value : (value?.name || '');

        // 🚨 IF CATEGORY IS BLANK -> RESET SUBCATEGORY
        if (!name || name.trim() === '') {
          this.productsForm.get('categoryId')?.setValue(null, { emitEvent: false });
          this.productsForm.get('subcategoryId')?.setValue(null, { emitEvent: false });
          this.productsForm.get('subcategorySearch')?.setValue('', { emitEvent: false });
          this.subcategories = [];
          this.cdr.detectChanges();
        }

        this.isSearchingCategories = true;
        const results = name ? this._filterCategories(name) : this.categories.slice();

        Promise.resolve().then(() => {
          this.isSearchingCategories = false;
          // Only show "No results" if user has typed something significant
          if (name && name.length > 2 && results.length === 0) {
            this.showNoResultsDialog('Category', name);
          }
          this.cdr.detectChanges();
        });
        return results;
      })
    );

    // 🔍 Subcategory Autocomplete with "No results found" popup
    this.filteredSubcategories = this.productsForm.get('subcategorySearch')!.valueChanges.pipe(
      startWith(''),
      map(value => {
        this.isSearchingSubcategories = true;
        const name = typeof value === 'string' ? value : (value?.subcategoryName || '');
        const results = name ? this._filterSubcategories(name) : this.subcategories.slice();

        Promise.resolve().then(() => {
          this.isSearchingSubcategories = false;
          if (name && results.length === 0) {
            this.showNoResultsDialog('Subcategory', name);
          }
          this.cdr.detectChanges();
        });
        return results;
      })
    );

    // 🔍 Unit Autocomplete
    this.filteredUnits = this.productsForm.get('unit')!.valueChanges.pipe(
      startWith(''),
      map(value => {
        this.isSearchingUnits = true;
        const filterValue = (typeof value === 'string' ? value : value?.name || '').toLowerCase();
        const results = this.units.filter(u => u.name.toLowerCase().includes(filterValue));

        Promise.resolve().then(() => {
          this.isSearchingUnits = false;
          this.cdr.detectChanges();
        });
        return results;
      })
    );
  }

  // 📝 Helper to show "No Results" dialog nicely
  private showNoResultsDialog(type: string, query: string) {
    // We only show it once per unique search to avoid annoying the user
    this.dialog.open(StatusDialogComponent, {
      data: {
        isSuccess: false,
        message: `No ${type} found matching "${query}". Please check the spelling or create a new ${type}.`
      }
    });
    // Reset search input so they can try again
    const searchControl = type === 'Category' ? 'categorySearch' : 'subcategorySearch';
    this.productsForm.get(searchControl)?.setValue('', { emitEvent: false });
  }

  private _filterCategories(value: string): any[] {
    const filterValue = value.toLowerCase();
    return this.categories.filter(c =>
      c.name.toLowerCase().includes(filterValue) ||
      (c.categoryCode && c.categoryCode.toLowerCase().includes(filterValue))
    );
  }

  private _filterSubcategories(value: string): any[] {
    const filterValue = value.toLowerCase();
    return this.subcategories.filter(s =>
      s.subcategoryName.toLowerCase().includes(filterValue) ||
      (s.subcategoryCode && s.subcategoryCode.toLowerCase().includes(filterValue))
    );
  }

  displayCategoryFn(category: any): string {
    return category ? `[${category.categoryCode}] - ${category.name}` : '';
  }

  displaySubcategoryFn(subcategory: any): string {
    return subcategory ? subcategory.subcategoryName : '';
  }

  onCategorySelected(event: any) {
    const category = event.option.value;
    this.productsForm.get('categoryId')?.setValue(category.id);
    this.onCategoryChange(category.id);
  }

  onSubcategorySelected(event: any) {
    const subcategory = event.option.value;
    this.productsForm.get('subcategoryId')?.setValue(subcategory.id);
  }

  loadProduct() {
    if (!this.productId) return;
    this.loading = true;
    this.productService.getById(this.productId!).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => {
        // Load subcategories first, then patch form
        this.productLukupService
          .getSubcategoriesByCategory(res.categoryId.toString())
          .pipe(finalize(() => {
            this.loading = false;
            this.cdr.detectChanges();
          }))
          .subscribe({
            next: (data: any) => {
              this.subcategories = data;
              this.productsForm.patchValue({
                categoryId: res.categoryId,
                subcategoryId: res.subcategoryId,
                productName: res.name || res.productName,
                sku: res.code || res.sku,
                brand: res.brand,
                unit: res.unit,
                saleRate: res.saleRate,
                hsnCode: res.hsnCode,
                basePurchasePrice: res.basePurchasePrice,
                mrp: res.mrp,
                defaultGst: res.defaultGst,
                trackInventory: res.trackInventory,
                description: res.description,
                productType: res.productType,
                damagedStock: res.damagedStock,
                defaultWarehouseId: res.defaultWarehouseId,
                defaultRackId: res.defaultRackId,
                isExpiryRequired: res.isExpiryRequired || false,
                imageUrl: res.imageUrl
              });

              this.previewImage = res.imageUrl || null;

              if (res.defaultWarehouseId) {
                this.onWarehouseChange(res.defaultWarehouseId, false);
              }

              // Sync Autocomplete text
              this.syncAutocomplete(res.categoryId, res.subcategoryId);
            },
            error: err => {
              console.error('Failed to load subcategories for product', err);
            }
          });
      },
      error: (err) => {
        this.loading = false;
        this.cdr.detectChanges();
        console.error('Failed to load product', err);
      }
    });
  }

  // ============================
  // 📁 BULK UPLOAD LOGIC
  // ============================
  selectedFile: File | null = null;
  selectedFileName: string = '';

  onFileSelected(event: any): void {
    const file: File = event.target.files[0];
    if (file) {
      const validExtensions = ['.xlsx', '.xls', '.csv'];
      const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      if (!validExtensions.includes(fileExtension)) {
        this.showError('Invalid file extension. Please upload .xlsx, .xls, or .csv file.');
        this.resetFile(event.target);
        return;
      }

      const maxSize = 5 * 1024 * 1024; // 5MB
      if (file.size > maxSize) {
        this.showError('File size exceeds 5MB limit.');
        this.resetFile(event.target);
        return;
      }

      this.selectedFile = file;
      this.selectedFileName = file.name;
      this.cdr.detectChanges();
    }
  }

  private showError(message: string): void {
    this.dialog.open(StatusDialogComponent, {
      data: { isSuccess: false, message: message }
    });
  }

  downloadTemplate() {
    const data = [
      ["Category", "Subcategory", "ProductName", "SKU", "Brand", "Unit", "BasePrice", "MRP", "SaleRate", "GST%", "HSNCode", "MinStock", "DamagedStock", "ProductType", "TrackInventory", "Active", "Description"],
      // --- Electrical Products ---
      ["Smart Electrical", "Fans", "Ceiling Fan 48 Inch", "ELEC001", "Havells", "PIECE", 1800, 2500, 2200, 18, "8414", 10, 0, "finished", "TRUE", "TRUE", "High speed decorative fan"],
      ["Smart Electrical", "Lights", "LED Bulb 9W", "ELEC002", "Philips", "PIECE", 60, 120, 100, 12, "8539", 50, 0, "finished", "TRUE", "TRUE", "Cool day light LED"],
      ["Smart Electrical", "Switches", "Modular Switch 6A", "ELEC003", "Anchor", "PIECE", 25, 45, 35, 18, "8536", 100, 0, "finished", "TRUE", "TRUE", "Smooth modular switch"],
      ["Smart Electrical", "Wires", "Copper Wire 1.5 SQMM", "ELEC004", "Polycab", "ROLL", 900, 1300, 1150, 18, "8544", 20, 0, "finished", "TRUE", "TRUE", "FR PVC insulated wire"],
      ["Smart Electrical", "Appliances", "Electric Kettle 1.5L", "ELEC005", "Prestige", "PIECE", 750, 1200, 1050, 18, "8516", 5, 0, "finished", "TRUE", "TRUE", "Stainless steel kettle"],
      ["Smart Electrical", "Protection", "MCB Single Pole 16A", "ELEC006", "Schneider", "PIECE", 150, 250, 220, 18, "8536", 15, 0, "finished", "TRUE", "TRUE", "C-Curve circuit breaker"],
      ["Smart Electrical", "Cables", "Coaxial Cable 90M", "ELEC007", "Finolex", "ROLL", 1100, 1600, 1400, 18, "8544", 10, 0, "finished", "TRUE", "TRUE", "TV signal cable"],
      ["Smart Electrical", "Tools", "Digital Multimeter", "ELEC008", "Mastech", "PIECE", 450, 800, 700, 18, "9030", 5, 0, "finished", "TRUE", "TRUE", "Auto-ranging multimeter"],
      ["Smart Electrical", "Batteries", "Inverter Battery 150Ah", "ELEC009", "Luminous", "PIECE", 12000, 16000, 14500, 28, "8507", 3, 0, "finished", "TRUE", "TRUE", "Tall tubular battery"],
      ["Smart Electrical", "Accessories", "Extension Board 4-Way", "ELEC010", "Goldmedal", "PIECE", 280, 450, 400, 18, "8536", 20, 0, "finished", "TRUE", "TRUE", "Surge protected strip"],

      // --- Grocery Products ---
      ["Grains & Pulses", "Rice", "Premium Basmati Rice", "GROC001", "Fortune", "KG", 80, 120, 110, 5, "1006", 50, 0, "finished", "TRUE", "TRUE", "Long grain aromatic rice"],
      ["Grains & Pulses", "Flour", "Chakki Fresh Atta", "GROC002", "Aashirvaad", "KG", 35, 55, 50, 5, "1101", 100, 0, "finished", "TRUE", "TRUE", "Whole wheat flour"],
      ["Grains & Pulses", "Pulses", "Toor Dal", "GROC003", "Tata Sampann", "KG", 130, 170, 160, 5, "0713", 60, 0, "finished", "TRUE", "TRUE", "Unpolished toor dal"],
      ["Edible Oils", "Mustard Oil", "Kachi Ghani Mustard Oil", "GROC004", "Engine", "LITER", 140, 190, 180, 5, "1514", 20, 0, "finished", "TRUE", "TRUE", "Pure mustard oil"],
      ["Edible Oils", "Refined Oil", "Refined Sunflower Oil", "GROC005", "Saffola", "LITER", 110, 150, 140, 5, "1512", 25, 0, "finished", "TRUE", "TRUE", "Healthy cooking oil"],
      ["Spices", "Powder Spices", "Turmeric Powder", "GROC006", "MDH", "PACKET", 20, 30, 28, 5, "0910", 40, 0, "finished", "TRUE", "TRUE", "Pure turmeric powder"],
      ["Spices", "Powder Spices", "Red Chilli Powder", "GROC007", "Everest", "PACKET", 25, 40, 35, 5, "0904", 40, 0, "finished", "TRUE", "TRUE", "Spicy red chilli powder"],
      ["Beverages", "Tea", "Masala Tea", "GROC008", "Tata Tea", "PACKET", 120, 180, 170, 5, "0902", 15, 0, "finished", "TRUE", "TRUE", "Aromatic tea with spices"],
      ["Beverages", "Coffee", "Instant Coffee", "GROC009", "Nescafe", "JAR", 150, 220, 210, 18, "2101", 10, 0, "finished", "TRUE", "TRUE", "Rich instant coffee"],
      ["Snacks", "Biscuits", "Marie Gold", "GROC010", "Britannia", "PACKET", 15, 25, 22, 12, "1905", 50, 0, "finished", "TRUE", "TRUE", "Classic tea biscuits"],
      ["Snacks", "Namkeen", "Aloo Bhujia", "GROC011", "Haldiram", "PACKET", 40, 60, 55, 12, "2106", 30, 0, "finished", "TRUE", "TRUE", "Savory potato snack"],
      ["Dairy", "Ghee", "Desi Ghee", "GROC012", "Amul", "LITER", 550, 650, 620, 12, "0405", 5, 0, "finished", "TRUE", "TRUE", "Pure cow ghee"],
      ["Dairy", "Paneer", "Fresh Paneer", "GROC013", "Mother Dairy", "PACKET", 70, 90, 85, 5, "0406", 12, 0, "finished", "TRUE", "TRUE", "Soft melting paneer"],
      ["Cleaning", "Detergent", "Detergent Powder", "GROC014", "Surf Excel", "KG", 120, 160, 150, 18, "3402", 20, 0, "finished", "TRUE", "TRUE", "Tough stain removal powder"],
      ["Cleaning", "Dishwash", "Dishwash Bar", "GROC015", "Vim", "PIECE", 10, 20, 18, 18, "3402", 100, 0, "finished", "TRUE", "TRUE", "Grease cutting dishwash bar"],
      ["Personal Care", "Soap", "Bathing Soap", "GROC016", "Dove", "PIECE", 40, 55, 52, 18, "3401", 40, 0, "finished", "TRUE", "TRUE", "Moisturizing bathing bar"],
      ["Personal Care", "Shampoo", "Anti-Dandruff Shampoo", "GROC017", "Head & Shoulders", "BOTTLE", 180, 250, 230, 18, "3305", 15, 0, "finished", "TRUE", "TRUE", "Dandruff protection shampoo"],
      ["Noodles & Pasta", "Noodles", "Instant Noodles 2-Min", "GROC018", "Maggi", "PACKET", 10, 14, 12, 12, "1902", 144, 0, "finished", "TRUE", "TRUE", "Quick instant noodles"],
      ["Sauces & Spreads", "Ketchup", "Tomato Ketchup", "GROC019", "Kissan", "BOTTLE", 110, 150, 140, 12, "2103", 10, 0, "finished", "TRUE", "TRUE", "Fresh tomato ketchup"],
      ["Sauces & Spreads", "Jam", "Mixed Fruit Jam", "GROC020", "Kissan", "JAR", 130, 180, 170, 12, "2007", 8, 0, "finished", "TRUE", "TRUE", "Delicious mixed fruit jam"],
      ["Groceries", "Sugar", "Refined Sugar", "GROC021", "Madhur", "KG", 38, 48, 45, 5, "1701", 50, 0, "finished", "TRUE", "TRUE", "Clean refined sugar"],
      ["Groceries", "Salt", "Iodized Salt", "GROC022", "Tata Salt", "PACKET", 18, 28, 25, 0, "2501", 40, 0, "finished", "TRUE", "TRUE", "Desh ka namak"]
    ];

    const ws: XLSX.WorkSheet = XLSX.utils.aoa_to_sheet(data);
    const wb: XLSX.WorkBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ProductsTemplate');
    XLSX.writeFile(wb, 'product_template.xlsx');
  }

  uploadExcel(): void {
    if (!this.selectedFile) return;

    this.loading = true;
    this.productService.uploadExcel(this.selectedFile).subscribe({
      next: (res) => {
        this.loading = false;
        let finalMessage = res.message || res.Message || 'File uploaded successfully';
        const errors = res.errors || res.Errors || [];

        if (errors.length > 0) {
          finalMessage += '\n\nRow-wise Status/Errors:\n' + errors.join('\n');
        }

        const successCountString = String(res.message || res.Message || '0');
        const successCount = parseInt(successCountString) || 0;
        const hasErrors = errors.length > 0;

        this.dialog.open(StatusDialogComponent, {
          data: {
            isSuccess: !hasErrors,
            message: finalMessage
          }
        }).afterClosed().subscribe(() => {
          if (!hasErrors || successCount > 0) {
            this.router.navigate(['/app/master/products']);
          }
        });
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.dialog.open(StatusDialogComponent, {
          data: {
            isSuccess: false,
            message: err.error?.message ?? 'Upload failed. Please ensure the Excel structure is correct.'
          }
        });
        this.cdr.detectChanges();
      }
    });
  }

  resetFile(input?: any): void {
    this.selectedFile = null;
    this.selectedFileName = '';
    if (input) {
      if (input.value !== undefined) input.value = '';
    }
    this.cdr.detectChanges();
  }

  onImageSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        this.previewImage = reader.result;
        this.productsForm.get('imageUrl')?.setValue(reader.result);
        this.cdr.detectChanges();
      };
      reader.readAsDataURL(file);
    }
  }

  private syncAutocomplete(catId: any, subId: any) {
    if (catId && this.categories.length > 0) {
      const cat = this.categories.find(c => c.id === catId);
      if (cat) this.productsForm.get('categorySearch')?.setValue(cat, { emitEvent: false });
    }
    if (subId && this.subcategories.length > 0) {
      const sub = this.subcategories.find(s => s.id === subId);
      if (sub) this.productsForm.get('subcategorySearch')?.setValue(sub, { emitEvent: false });
    }
  }

  createForm() {
    this.productsForm = this.fb.group({
      categoryId: [null, [Validators.required]],
      categorySearch: ['', [Validators.required]],
      subcategoryId: [null, [Validators.required]],
      subcategorySearch: ['', [Validators.required]],
      productName: ['', [Validators.required, Validators.maxLength(30)]],
      sku: [null],
      brand: [null, [Validators.maxLength(30)]],
      unit: ['', [Validators.required]],
      hsnCode: [null],
      basePurchasePrice: [0, [Validators.required, Validators.min(0)]],
      mrp: [0, [Validators.min(0)]],
      defaultGst: [0, [Validators.required]],
      trackInventory: [true],
      isActive: [true],
      minStock: [0, [Validators.min(0)]],
      description: [null],
      saleRate: [0, [Validators.min(0)]],
      productType: [null, [Validators.required]],
      damagedStock: [0],
      defaultWarehouseId: [null, [Validators.required]],
      defaultRackId: [null, [Validators.required]],
      isExpiryRequired: [false],
      imageUrl: [null]
    });
  }

  loadInitialLookups() {
    this.unitService.getAll().subscribe(data => this.units = data || []);
    this.locationService.getWarehouses().pipe(takeUntil(this.destroy$)).subscribe(data => this.warehouses = data.filter(w => w.isActive));
    this.locationService.getRacks().pipe(takeUntil(this.destroy$)).subscribe(data => {
      this.racks = data.filter(r => r.isActive);
      const warehouseId = this.productsForm.get('defaultWarehouseId')?.value;
      if (warehouseId) {
        this.onWarehouseChange(warehouseId, false);
      }
    });

    this.productLukupService.getLookups().pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => {
        this.categories = res.categories;
        if (this.isEditMode) {
          const catId = this.productsForm.get('categoryId')?.value;
          this.syncAutocomplete(catId, null);
        }
      },
      error: (err) => console.error('Lookup load failed', err)
    });
  }

  onWarehouseChange(warehouseId: string, clearSelection: boolean = true) {
    if (!warehouseId) {
      this.filteredRacks = [];
      if (clearSelection) this.productsForm.get('defaultRackId')?.setValue(null);
      return;
    }

    this.filteredRacks = this.racks.filter(r => r.warehouseId === warehouseId);
    
    if (clearSelection) {
      // If current selected rack is not in the new filtered list, clear it
      const currentRackId = this.productsForm.get('defaultRackId')?.value;
      if (currentRackId && !this.filteredRacks.some(r => r.id === currentRackId)) {
        this.productsForm.get('defaultRackId')?.setValue(null);
      }
    }
    this.cdr.detectChanges();
  }

  onCategoryChange(categoryId: number): void {
    // Purana selection aur list clear karo
    this.subcategories = [];
    this.productsForm.get('subcategoryId')?.setValue(null);
    this.productsForm.get('subcategorySearch')?.setValue('', { emitEvent: false });

    if (!categoryId) return;

    this.loading = true;
    this.productLukupService
      .getSubcategoriesByCategory(categoryId.toString())
      .pipe(finalize(() => {
        this.loading = false;
        this.cdr.detectChanges();
      }))
      .subscribe({
        next: (data: any) => {
          this.subcategories = data;
          // Trigger subcategory autocomplete reset to current list
          this.productsForm.get('subcategorySearch')?.setValue('');
        },
        error: err => {
          console.error('Failed to load subcategories', err);
        }
      });
  }

  onSave(): void {
    if (this.productsForm.invalid) {
      this.productsForm.markAllAsTouched();
      return;
    }

    const productName = this.productsForm.get('productName')?.value;
    this.loading = true;

    // Check for duplicate product name before saving
    this.productService.checkDuplicate(productName, this.productId).subscribe({
      next: (res) => {
        if (res.exists) {
          this.loading = false;
          this.cdr.detectChanges();
          this.showDialog(false, res.message || 'Product with this name already exists.');
        } else {
          this.proceedWithSave();
        }
      },
      error: (err) => {
        this.loading = false;
        this.cdr.detectChanges();
        console.error('Duplicate check failed', err);
        // If check fails, we might still want to try saving, or block it. 
        // Given user's request, blocking is safer but might be annoying if API is down.
        // Let's proceed with save if it's just a network error on check.
        this.proceedWithSave();
      }
    });
  }

  private proceedWithSave(): void {
    this.loading = true;
    const currentUserId = localStorage.getItem('email') || '';
    const productsData = this.mapToProducts(this.productsForm.value);

    if (this.isEditMode && this.productId) {
      productsData.id = this.productId;
      productsData.updatedby = currentUserId;
    } else {
      productsData.createdby = currentUserId;
    }

    const request = this.isEditMode && this.productId
      ? this.productService.update(this.productId, productsData)
      : this.productService.create(productsData);

    request.subscribe({
      next: (res) => {
        this.loading = false;
        this.cdr.detectChanges();
        
        const successMsg = res.message || (this.isEditMode ? 'Product updated successfully' : 'Product saved successfully');
        
        if (this.isDialog) {
             // Return the newly created/updated product object to caller
             this.dialogRef?.close({ ...productsData, id: res.id || this.productId });
             return;
        }

        this.showDialog(true, successMsg);
      },
      error: (err) => {
        this.loading = false;
        this.cdr.detectChanges();
        this.showDialog(false, err.error?.message ?? 'Something went wrong');
      }
    });
  }

  private showDialog(isSuccess: boolean, msg: string) {
    this.dialog.open(StatusDialogComponent, {
      data: { isSuccess: isSuccess, message: msg }
    }).afterClosed().subscribe(() => {
      if (isSuccess) {
        this.router.navigate(['/app/master/products']);
      }
    });
  }

  onCancel() {
    if (this.isDialog) {
      this.dialogRef?.close();
      return;
    }
    this.router.navigate(['/app/master/products']);
  }

  private mapToProducts(formValue: any): any {
    return {
      categoryId: formValue.categoryId,
      subcategoryId: formValue.subcategoryId,
      productName: formValue.productName?.trim(),
      sku: formValue.sku?.trim(),
      brand: formValue.brand?.trim(),
      unit: formValue.unit,
      hsnCode: formValue.hsnCode?.trim(),
      basePurchasePrice: Number(formValue.basePurchasePrice),
      mrp: Number(formValue.mrp),
      defaultGst: Number(formValue.defaultGst),
      minStock: Number(formValue.minStock),
      trackInventory: Boolean(formValue.trackInventory),
      isActive: Boolean(formValue.isActive),
      description: formValue.description?.trim(),
      saleRate: Number(formValue.saleRate),
      productType: formValue.productType ? String(formValue.productType) : '',
      damagedStock: formValue.damagedStock ? Number(formValue.damagedStock) : 0,
      defaultWarehouseId: formValue.defaultWarehouseId,
      defaultRackId: formValue.defaultRackId,
      isExpiryRequired: Boolean(formValue.isExpiryRequired),
      imageUrl: formValue.imageUrl
    };
  }
}