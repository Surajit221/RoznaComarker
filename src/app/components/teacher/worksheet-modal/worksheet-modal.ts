import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnDestroy, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FoodChainBuilderComponent } from '../food-chain-builder/food-chain-builder';
import { MatchCardComponent } from '../match-card/match-card';
import { ProgressBarComponent } from '../progress-bar/progress-bar';
import { QuizComponent } from '../quiz/quiz';
import {
  FillBlankPrompt,
  FillBlankWord,
  FoodChainStep,
  MatchCardData,
  MatchCardOption,
  QuizQuestion,
  WorksheetActivityResult,
  WorksheetRole,
} from '../../../models/worksheet.model';
import { WorksheetPrintService } from './worksheet-print.service';

@Component({
  selector: 'app-worksheet-modal',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ProgressBarComponent,
    FoodChainBuilderComponent,
    MatchCardComponent,
    QuizComponent,
  ],
  templateUrl: './worksheet-modal.html',
  styleUrl: './worksheet-modal.css',
})
export class WorksheetModalComponent implements OnDestroy {
  private readonly printService = inject(WorksheetPrintService);

  private _show = false;
  private _savedScrollY = 0;

  @Input()
  set show(value: boolean) {
    this._show = value;
    if (typeof document === 'undefined') return;
    if (value) {
      this._savedScrollY = typeof window !== 'undefined' ? (window.scrollY || 0) : 0;
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${this._savedScrollY}px`;
      document.body.style.width = '100%';
    } else {
      this._restoreBodyScroll();
    }
  }

  get show(): boolean {
    return this._show;
  }

  @Output() showChange = new EventEmitter<boolean>();
  @Output() backToPicker = new EventEmitter<void>();

  readonly totalActivities = 4;
  readonly today = new Date().toISOString().split('T')[0];

  readonly roleOptions: MatchCardOption[] = [
    { value: 'producer', label: 'Producer', emoji: '🌿' },
    { value: 'consumer', label: 'Consumer', emoji: '🐾' },
    { value: 'decomposer', label: 'Decomposer', emoji: '🍄' },
  ];

  readonly baseFoodChainSteps: FoodChainStep[] = [
    { id: 'sun', label: 'Sun', emoji: '☀️', role: 'Energy source' },
    { id: 'plant', label: 'Plant', emoji: '🌿', role: 'Producer' },
    { id: 'grasshopper', label: 'Grasshopper', emoji: '🦗', role: 'Primary consumer' },
    { id: 'frog', label: 'Frog', emoji: '🐸', role: 'Secondary consumer' },
    { id: 'snake', label: 'Snake', emoji: '🐍', role: 'Predator' },
    { id: 'eagle', label: 'Eagle', emoji: '🦅', role: 'Top predator' },
  ];

  readonly baseWhoAmICards: MatchCardData[] = [
    {
      id: 'plant-role',
      title: 'Green Plant',
      clue: 'I use sunlight, air, and water to make my own food.',
      emoji: '🌿',
      answer: 'producer',
      explanation: 'Plants are producers because they make food for themselves and start many food chains.',
    },
    {
      id: 'frog-role',
      title: 'Hungry Frog',
      clue: 'I eat insects to get the energy I need.',
      emoji: '🐸',
      answer: 'consumer',
      explanation: 'A frog is a consumer because it gets energy by eating other living things.',
    },
    {
      id: 'mushroom-role',
      title: 'Mushroom Helper',
      clue: 'I break down dead plants and animals and return nutrients to the soil.',
      emoji: '🍄',
      answer: 'decomposer',
      explanation: 'A mushroom is a decomposer because it helps recycle nutrients back into the ground.',
    },
  ];

  readonly baseQuizQuestions: QuizQuestion[] = [
    {
      id: 'quiz-1',
      prompt: 'Which living thing is the producer in this food chain?',
      answerId: 'b',
      explanation: 'The plant is the producer because it makes its own food using sunlight.',
      options: [
        { id: 'a', label: 'Frog' },
        { id: 'b', label: 'Plant' },
        { id: 'c', label: 'Snake' },
        { id: 'd', label: 'Eagle' },
      ],
    },
    {
      id: 'quiz-2',
      prompt: 'What starts the flow of energy in a food chain?',
      answerId: 'a',
      explanation: 'The sun provides the energy that plants use to grow and make food.',
      options: [
        { id: 'a', label: 'The sun' },
        { id: 'b', label: 'The frog' },
        { id: 'c', label: 'The soil' },
        { id: 'd', label: 'The snake' },
      ],
    },
    {
      id: 'quiz-3',
      prompt: 'Why is the eagle called the top predator in this chain?',
      answerId: 'c',
      explanation: 'The eagle is at the end of this chain because it eats other consumers and nothing here eats it.',
      options: [
        { id: 'a', label: 'It makes food from sunlight.' },
        { id: 'b', label: 'It lives in the soil.' },
        { id: 'c', label: 'It is at the top of this feeding chain.' },
        { id: 'd', label: 'It only eats plants.' },
      ],
    },
  ];

  readonly fillBlankPrompts: FillBlankPrompt[] = [
    {
      id: 'blank-1',
      before: 'A',
      answerId: 'producer',
      after: 'makes its own food using sunlight.',
    },
    {
      id: 'blank-2',
      before: 'A frog is a',
      answerId: 'consumer',
      after: 'because it eats other animals.',
    },
    {
      id: 'blank-3',
      before: 'The',
      answerId: 'sun',
      after: 'gives the first energy in the food chain.',
    },
    {
      id: 'blank-4',
      before: 'A food chain shows how',
      answerId: 'energy',
      after: 'moves from one living thing to another.',
    },
  ];

  readonly fillBlankWords: FillBlankWord[] = [
    { id: 'producer', label: 'producer' },
    { id: 'consumer', label: 'consumer' },
    { id: 'sun', label: 'sun' },
    { id: 'energy', label: 'energy' },
  ];

  studentName = '';
  worksheetDate = this.today;

  foodChainBuilderSteps: FoodChainStep[] = this.cloneFoodChainSteps();
  whoAmICards: MatchCardData[] = this.cloneWhoAmICards();
  quizQuestions: QuizQuestion[] = this.cloneQuizQuestions();
  fillBlankSelections: Array<FillBlankWord | null> = this.createEmptyFillBlankSelections();
  selectedFillBlankIndex = 0;
  fillBlankSubmitted = false;

  builderResult: WorksheetActivityResult = { completed: false, score: 0, maxScore: this.baseFoodChainSteps.length, selections: [] };
  quizResult: WorksheetActivityResult = { completed: false, score: 0, maxScore: this.baseQuizQuestions.length, selections: {} };

  completedFlags = {
    builder: false,
    whoAmI: false,
    quiz: false,
    fillBlanks: false,
  };

  get completedActivities(): number {
    return Object.values(this.completedFlags).filter(Boolean).length;
  }

  get progressSubtitle(): string {
    if (this.completedActivities === this.totalActivities) {
      return 'Every activity is complete. Your final score is ready below.';
    }

    if (this.completedActivities === 0) {
      return 'Start with any activity and watch the progress bar fill up.';
    }

    return 'Complete the remaining activities to unlock the final celebration card.';
  }

  get whoAmICompleted(): boolean {
    return this.whoAmICards.length > 0 && this.whoAmICards.every((card) => !!card.revealed);
  }

  get whoAmIScore(): number {
    return this.whoAmICards.reduce((count, card) => {
      return card.revealed && card.selectedRole === card.answer ? count + 1 : count;
    }, 0);
  }

  get availableFillBlankWords(): FillBlankWord[] {
    const usedIds = new Set(this.fillBlankSelections.filter((word): word is FillBlankWord => !!word).map((word) => word.id));
    return this.fillBlankWords.filter((word) => !usedIds.has(word.id));
  }

  get isFillBlankReady(): boolean {
    return this.fillBlankSelections.every((word) => !!word);
  }

  get fillBlankScore(): number {
    return this.fillBlankSelections.reduce((count, word, index) => {
      if (!word) {
        return count;
      }

      return word.id === this.fillBlankPrompts[index]?.answerId ? count + 1 : count;
    }, 0);
  }

  get fillBlankComplete(): boolean {
    return this.fillBlankSubmitted;
  }

  get totalScore(): number {
    return (
      this.builderResult.score +
      this.whoAmIScore +
      this.quizResult.score +
      (this.fillBlankSubmitted ? this.fillBlankScore : 0)
    );
  }

  get maxScore(): number {
    return this.baseFoodChainSteps.length + this.baseWhoAmICards.length + this.baseQuizQuestions.length + this.fillBlankPrompts.length;
  }

  get scorePercentage(): number {
    if (this.maxScore <= 0) {
      return 0;
    }

    return Math.round((this.totalScore / this.maxScore) * 100);
  }

  get allActivitiesCompleted(): boolean {
    return this.completedActivities === this.totalActivities;
  }

  get encouragementMessage(): string {
    if (this.scorePercentage >= 90) {
      return 'Outstanding! You really understand how energy moves through a food chain.';
    }

    if (this.scorePercentage >= 70) {
      return 'Great job! You can explain producers, consumers, and decomposers with confidence.';
    }

    if (this.scorePercentage >= 50) {
      return 'Nice work! A quick retry will help you master each step of the chain.';
    }

    return 'Good start! Try the activities again and use the concept card to guide your thinking.';
  }

  closeAll(): void {
    this.show = false;
    this.showChange.emit(false);
    this.resetWorksheet();
  }

  goBack(): void {
    this.show = false;
    this.showChange.emit(false);
    this.resetWorksheet();
    this.backToPicker.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('ws-backdrop')) {
      this.closeAll();
    }
  }

  onBuilderResultChange(result: WorksheetActivityResult): void {
    this.builderResult = result;
    if (result.completed) {
      this.completedFlags.builder = true;
    }
  }

  onRoleSelected(payload: { cardId: string; role: WorksheetRole }): void {
    this.whoAmICards = this.whoAmICards.map((card) => {
      if (card.id !== payload.cardId || card.revealed) {
        return card;
      }

      return {
        ...card,
        selectedRole: payload.role,
      };
    });
  }

  onRevealCard(cardId: string): void {
    this.whoAmICards = this.whoAmICards.map((card) => {
      if (card.id !== cardId) {
        return card;
      }

      return {
        ...card,
        revealed: true,
      };
    });

    if (this.whoAmICompleted) {
      this.completedFlags.whoAmI = true;
    }
  }

  retryWhoAmI(): void {
    this.whoAmICards = this.cloneWhoAmICards();
  }

  onQuizResultChange(result: WorksheetActivityResult): void {
    this.quizResult = result;
    if (result.completed) {
      this.completedFlags.quiz = true;
    }
  }

  selectFillBlank(index: number): void {
    if (this.fillBlankSubmitted) {
      return;
    }

    this.selectedFillBlankIndex = index;
  }

  placeFillBlankWord(word: FillBlankWord): void {
    if (this.fillBlankSubmitted) {
      return;
    }

    const nextSelections = [...this.fillBlankSelections];
    const existingIndex = nextSelections.findIndex((item) => item?.id === word.id);
    if (existingIndex >= 0) {
      nextSelections[existingIndex] = null;
    }

    let targetIndex = this.selectedFillBlankIndex;
    if (targetIndex < 0 || targetIndex >= nextSelections.length) {
      targetIndex = nextSelections.findIndex((item) => !item);
    }

    if (targetIndex < 0) {
      targetIndex = 0;
    }

    nextSelections[targetIndex] = word;
    this.fillBlankSelections = nextSelections;
    this.focusNextFillBlank(targetIndex);
  }

  clearFillBlank(index: number): void {
    if (this.fillBlankSubmitted) {
      return;
    }

    const nextSelections = [...this.fillBlankSelections];
    nextSelections[index] = null;
    this.fillBlankSelections = nextSelections;
    this.selectedFillBlankIndex = index;
  }

  submitFillBlanks(): void {
    if (!this.isFillBlankReady) {
      return;
    }

    this.fillBlankSubmitted = true;
    this.completedFlags.fillBlanks = true;
  }

  resetFillBlanks(): void {
    this.fillBlankSelections = this.createEmptyFillBlankSelections();
    this.fillBlankSubmitted = false;
    this.selectedFillBlankIndex = 0;
  }

  getFillBlankState(index: number): 'empty' | 'active' | 'filled' | 'correct' | 'wrong' {
    const word = this.fillBlankSelections[index];

    if (!word) {
      return this.selectedFillBlankIndex === index && !this.fillBlankSubmitted ? 'active' : 'empty';
    }

    if (this.fillBlankSubmitted) {
      return word.id === this.fillBlankPrompts[index]?.answerId ? 'correct' : 'wrong';
    }

    return this.selectedFillBlankIndex === index ? 'active' : 'filled';
  }

  retryWorksheet(): void {
    this.foodChainBuilderSteps = this.cloneFoodChainSteps();
    this.whoAmICards = this.cloneWhoAmICards();
    this.quizQuestions = this.cloneQuizQuestions();
    this.resetFillBlanks();
    this.builderResult = { completed: false, score: 0, maxScore: this.baseFoodChainSteps.length, selections: [] };
    this.quizResult = { completed: false, score: 0, maxScore: this.baseQuizQuestions.length, selections: {} };
    this.completedFlags = {
      builder: false,
      whoAmI: false,
      quiz: false,
      fillBlanks: false,
    };
  }

  trackByStep(_: number, step: FoodChainStep): string {
    return step.id;
  }

  trackByCard(_: number, card: MatchCardData): string {
    return card.id;
  }

  trackByPrompt(_: number, prompt: FillBlankPrompt): string {
    return prompt.id;
  }

  trackByWord(_: number, word: FillBlankWord): string {
    return word.id;
  }

  downloadWorksheet(): void {
    this.printService.print({
      studentName: this.studentName,
      date: this.worksheetDate,
      foodChainSteps: this.foodChainBuilderSteps,
      whoAmICards: this.whoAmICards,
      quizQuestions: this.quizQuestions,
      fillBlankPrompts: this.fillBlankPrompts,
      fillBlankWords: this.fillBlankWords,
    });
  }

  private resetWorksheet(): void {
    this.studentName = '';
    this.worksheetDate = this.today;
    this.retryWorksheet();
  }

  private cloneFoodChainSteps(): FoodChainStep[] {
    return this.baseFoodChainSteps.map((step) => ({ ...step }));
  }

  private cloneWhoAmICards(): MatchCardData[] {
    return this.baseWhoAmICards.map((card) => ({
      ...card,
      selectedRole: null,
      revealed: false,
    }));
  }

  private cloneQuizQuestions(): QuizQuestion[] {
    return this.baseQuizQuestions.map((question) => ({
      ...question,
      selectedOptionId: null,
      revealed: false,
      options: question.options.map((option) => ({ ...option })),
    }));
  }

  private createEmptyFillBlankSelections(): Array<FillBlankWord | null> {
    return Array.from({ length: this.fillBlankPrompts.length }).map(() => null);
  }

  private focusNextFillBlank(currentIndex: number): void {
    const nextEmpty = this.fillBlankSelections.findIndex((item) => !item);
    if (nextEmpty >= 0) {
      this.selectedFillBlankIndex = nextEmpty;
      return;
    }

    this.selectedFillBlankIndex = Math.min(currentIndex, this.fillBlankSelections.length - 1);
  }

  ngOnDestroy(): void {
    this._restoreBodyScroll();
  }

  private _restoreBodyScroll(): void {
    if (typeof document === 'undefined') return;
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    if (typeof window !== 'undefined') {
      window.scrollTo(0, this._savedScrollY);
    }
  }
}
