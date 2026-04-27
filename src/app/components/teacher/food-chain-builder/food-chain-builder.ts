import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FoodChainStep, WorksheetActivityResult } from '../../../models/worksheet.model';

@Component({
  selector: 'app-food-chain-builder',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './food-chain-builder.html',
  styleUrl: './food-chain-builder.css',
})
export class FoodChainBuilderComponent {
  private _steps: FoodChainStep[] = [];

  @Input() title = 'Activity 1: Build the Food Chain';
  @Input() subtitle = 'Place each card in the correct order from the source of energy to the top predator.';
  @Output() resultChange = new EventEmitter<WorksheetActivityResult>();

  @Input() set steps(value: FoodChainStep[]) {
    this._steps = Array.isArray(value) ? value.map((step) => ({ ...step })) : [];
    this.initializeBuilder(false);
  }

  get steps(): FoodChainStep[] {
    return this._steps;
  }

  slots: Array<FoodChainStep | null> = [];
  selectedSlotIndex = 0;
  submitted = false;

  get isReady(): boolean {
    return this.slots.length > 0 && this.slots.every((slot) => !!slot);
  }

  get score(): number {
    return this.slots.reduce((count, slot, index) => {
      if (!slot) {
        return count;
      }

      return slot.id === this.steps[index]?.id ? count + 1 : count;
    }, 0);
  }

  get hasPerfectOrder(): boolean {
    return this.isReady && this.score === this.steps.length;
  }

  get availableSteps(): FoodChainStep[] {
    const usedIds = new Set(this.slots.filter((slot): slot is FoodChainStep => !!slot).map((slot) => slot.id));
    return this.steps.filter((step) => !usedIds.has(step.id));
  }

  trackByStep(_: number, step: FoodChainStep): string {
    return step.id;
  }

  setActiveSlot(index: number): void {
    if (this.submitted) {
      return;
    }

    this.selectedSlotIndex = index;
  }

  placeStep(step: FoodChainStep): void {
    if (this.submitted || !step) {
      return;
    }

    const existingIndex = this.slots.findIndex((slot) => slot?.id === step.id);
    if (existingIndex >= 0) {
      this.slots[existingIndex] = null;
    }

    let targetIndex = this.selectedSlotIndex;
    if (targetIndex < 0 || targetIndex >= this.slots.length) {
      targetIndex = this.slots.findIndex((slot) => !slot);
    }

    if (targetIndex < 0) {
      targetIndex = 0;
    }

    this.slots[targetIndex] = step;
    this.focusNextEmptySlot(targetIndex);
  }

  clearSlot(index: number): void {
    if (this.submitted) {
      return;
    }

    this.slots[index] = null;
    this.selectedSlotIndex = index;
  }

  submitBuilder(): void {
    if (!this.isReady) {
      return;
    }

    this.submitted = true;
    this.emitResult(true);
  }

  resetBuilder(): void {
    this.initializeBuilder(true);
  }

  getSlotState(index: number): 'empty' | 'active' | 'correct' | 'wrong' | 'filled' {
    const slot = this.slots[index];

    if (!slot) {
      return this.selectedSlotIndex === index && !this.submitted ? 'active' : 'empty';
    }

    if (this.submitted) {
      return slot.id === this.steps[index]?.id ? 'correct' : 'wrong';
    }

    return this.selectedSlotIndex === index ? 'active' : 'filled';
  }

  private initializeBuilder(emitResult: boolean): void {
    this.slots = Array.from({ length: this.steps.length }).map(() => null);
    this.selectedSlotIndex = 0;
    this.submitted = false;

    if (emitResult) {
      this.emitResult(false);
    }
  }

  private emitResult(completed: boolean): void {
    this.resultChange.emit({
      completed,
      score: completed ? this.score : 0,
      maxScore: this.steps.length,
      selections: this.slots.map((slot) => slot?.id ?? null),
    });
  }

  private focusNextEmptySlot(currentIndex: number): void {
    const nextEmpty = this.slots.findIndex((slot) => !slot);
    if (nextEmpty >= 0) {
      this.selectedSlotIndex = nextEmpty;
      return;
    }

    this.selectedSlotIndex = Math.min(currentIndex, this.slots.length - 1);
  }
}
