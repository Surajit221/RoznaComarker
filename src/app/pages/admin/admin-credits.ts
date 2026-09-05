import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, OnDestroy, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CreditsApiService, type AdminCreditWalletResponse, type CreditTeacher } from '../../api/credits-api.service';
import { AlertService } from '../../services/alert.service';

@Component({ selector: 'app-admin-credits', standalone: true, imports: [CommonModule, FormsModule],
  templateUrl: './admin-credits.html', styleUrl: './admin-credits.css' })
export class AdminCredits implements OnDestroy {
  readonly Math = Math;
  private readonly api = inject(CreditsApiService); private readonly alerts = inject(AlertService);
  query = ''; teachers: CreditTeacher[] = []; selected: AdminCreditWalletResponse | null = null;
  @ViewChild('detailsDrawer') detailsDrawer?: ElementRef<HTMLElement>;
  amount: number | null = null; reason = ''; loading = false; adjusting=false;directoryPage=1;directoryPages=1;directoryTotal=0;
  drawerOpen=false;detailLoading=false;detailError='';drawerTeacher:CreditTeacher|null=null;
  private drawerTrigger:HTMLElement|null=null;
  async ngOnInit():Promise<void>{await this.loadDirectory(1)}
  async loadDirectory(page:number): Promise<void> { this.loading = true; try { const result=await this.api.searchTeachers(this.query,page);this.teachers=result.teachers;this.directoryPage=result.pagination.page;this.directoryPages=Math.max(1,result.pagination.pages);this.directoryTotal=result.pagination.total; }
    catch (e: any) { this.alerts.showError('Search failed', e?.error?.message || 'Please try again.'); } finally { this.loading = false; } }
  search():Promise<void>{return this.loadDirectory(1)}
  async select(teacher: CreditTeacher, page = 1, event?: Event): Promise<void> {
    if(event?.currentTarget instanceof HTMLElement)this.drawerTrigger=event.currentTarget;
    this.drawerTeacher=teacher;this.drawerOpen=true;this.detailLoading=true;this.detailError='';document.body.style.overflow='hidden';
    try { this.selected = await this.api.getAdminWallet(teacher._id, page); }
    catch (e: any) { this.selected=null;this.detailError=e?.error?.message || 'Unable to load credit details. Please try again.'; }
    finally { this.detailLoading=false;setTimeout(()=>this.detailsDrawer?.nativeElement.focus()); }
  }
  retryDetails():Promise<void>{return this.drawerTeacher?this.select(this.drawerTeacher):Promise.resolve()}
  closeDrawer():void{this.drawerOpen=false;document.body.style.overflow='';const trigger=this.drawerTrigger;this.drawerTrigger=null;setTimeout(()=>trigger?.focus())}
  @HostListener('document:keydown.escape') onEscape():void{if(this.drawerOpen)this.closeDrawer()}
  ngOnDestroy():void{document.body.style.overflow=''}
  async adjust(sign: 1 | -1): Promise<void> {
    if (!this.selected || !Number.isInteger(Number(this.amount)) || Number(this.amount) <= 0 || !this.reason.trim()) {
      this.alerts.showWarning('Adjustment incomplete', 'Enter a positive whole number and a reason.'); return;
    }
    const delta = sign * Number(this.amount);
    if (delta < 0 && !await this.alerts.showConfirm('Remove Assessment Credits?',
      `Remove ${Math.abs(delta)} credits from ${this.selected.teacher.displayName || this.selected.teacher.email}?`, 'Remove Credits', 'Cancel')) return;
    if(this.adjusting)return;this.adjusting=true;try {
      const result = await this.api.adjust(this.selected.teacher._id, delta, this.reason.trim());
      this.selected = { ...this.selected, wallet: result.wallet }; this.amount = null; this.reason = '';
      await this.select(this.selected.teacher, 1);
      this.alerts.showSuccess('Credits updated', `${result.wallet.availableCredits} credits are now available.`);
    } catch (e: any) { this.alerts.showError('Adjustment failed', e?.error?.message || 'Please try again.'); }finally{this.adjusting=false}
  }
  transactionLabel(type:string):string{return({REFERRAL_REFERRER_BONUS:'Referral reward',REFERRAL_REFERRED_BONUS:'Referral reward',BONUS_REWARD:'Bonus reward',ASSESSMENT_DEBIT:'Assessment',ADMIN_ADJUSTMENT:'Admin adjustment',MONTHLY_RESET:'Monthly reset',PLAN_ALLOWANCE_CHANGE:'Plan allowance change'} as Record<string,string>)[type]||type.replaceAll('_',' ').toLowerCase().replace(/^./,c=>c.toUpperCase())}
}
