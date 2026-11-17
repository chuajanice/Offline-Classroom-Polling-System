// Question paper model (Stage 5). Pure: no PDF library needed.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildQuestionPaper, choiceLetter } from "../../src/lib/question-paper-model";

const input = {
  activityTitle: "Quiz 1",
  classroomName: "BSIT 3A",
  instructorName: "Ana Teacher",
  generatedAt: "2030-03-01T00:00:00Z",
  questions: [
    { questionText: "Capital of France?", points: 2, choices: [
      { choiceText: "Berlin", isCorrect: false },
      { choiceText: "Paris", isCorrect: true },
      { choiceText: "Rome", isCorrect: false },
    ] },
    { questionText: "2 + 2?", points: 1, choices: [
      { choiceText: "4", isCorrect: true },
      { choiceText: "5", isCorrect: false },
    ] },
  ],
};

describe("buildQuestionPaper", () => {
  it("numbers questions in the order given and labels choices A, B, C", () => {
    const model = buildQuestionPaper(input);
    assert.deepEqual(model.questions.map((q) => q.number), [1, 2]);
    assert.deepEqual(model.questions[0].choices.map((c) => c.letter), ["A", "B", "C"]);
    assert.equal(model.questions[0].choices[1].text, "Paris");
  });

  it("puts the correct letter and text on the answer key, one row per question", () => {
    const model = buildQuestionPaper(input);
    assert.deepEqual(model.answerKey, [
      { number: 1, letter: "B", text: "Paris" },
      { number: 2, letter: "A", text: "4" },
    ]);
  });

  it("keeps the answer key out of the question paper itself", () => {
    const model = buildQuestionPaper(input);
    const questionsOnly = JSON.stringify(model.questions);
    assert.ok(!questionsOnly.includes("isCorrect"));
    // Every choice is printed, correct or not, so the text itself is expected on the paper.
    assert.ok(questionsOnly.includes("Paris"));
  });

  it("reports a missing correct answer as null rather than guessing", () => {
    const model = buildQuestionPaper({
      ...input,
      questions: [{ questionText: "Broken?", points: 1, choices: [{ choiceText: "x", isCorrect: false }] }],
    });
    assert.deepEqual(model.answerKey[0], { number: 1, letter: null, text: null });
  });

  it("carries the branding and the header details", () => {
    const model = buildQuestionPaper(input);
    assert.equal(model.productName, "Pollify");
    assert.equal(model.classroomName, "BSIT 3A");
    assert.equal(model.instructorName, "Ana Teacher");
    assert.match(model.generated, /\d{2}\/\d{2}\/\d{4}/);
  });
});

describe("choiceLetter", () => {
  it("gives A to Z and then falls back to numbers", () => {
    assert.equal(choiceLetter(0), "A");
    assert.equal(choiceLetter(25), "Z");
    assert.equal(choiceLetter(26), "27");
  });
});
