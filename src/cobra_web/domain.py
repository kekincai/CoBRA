from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Positive = Annotated[float, Field(gt=0, le=1e12, allow_inf_nan=False)]
NonNegative = Annotated[float, Field(ge=0, le=1e12, allow_inf_nan=False)]
Rate = Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)]
Text = Annotated[str, Field(min_length=1, max_length=300)]
Source = Literal["COMPANY_ACTUAL", "COBRA_PUBLIC_SAMPLE", "IPA_BENCHMARK", "DEMO", "SYNTHETIC"]
Level = Annotated[int, Field(ge=0, le=3, strict=True)]


class Record(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Expert(Record):
    name: Text
    minimum: NonNegative
    mode: NonNegative
    maximum: NonNegative

    @model_validator(mode="after")
    def ordered(self):
        if not self.minimum <= self.mode <= self.maximum:
            raise ValueError("最小値 ≤ 最頻値 ≤ 最大値で入力してください。")
        return self


class Driver(Record):
    id: Annotated[str, Field(pattern=r"^[A-Za-z0-9_-]{1,64}$")]
    name: Text
    description: str = ""
    levels: Annotated[list[Text], Field(min_length=4, max_length=4)]
    experts: Annotated[list[Expert], Field(min_length=1, max_length=30)]
    enabled: bool = True


class DriverSet(Record):
    name: Text
    drivers: Annotated[list[Driver], Field(min_length=1, max_length=100)]
    assessment_notes: Text = "熟練者評価を等重みで平均した三角分布を使用。"

    @model_validator(mode="after")
    def unique(self):
        if len({d.id for d in self.drivers}) != len(self.drivers):
            raise ValueError("Driver ID が重複しています。")
        if not any(d.enabled for d in self.drivers):
            raise ValueError("有効な Cost Driver が必要です。")
        return self


class Project(Record):
    id: Annotated[str, Field(pattern=r"^[A-Za-z0-9_-]{1,64}$")]
    name: Text
    size: Positive
    size_unit: Text
    actual_effort: Positive
    fixed_effort: NonNegative = 0
    levels: dict[str, Level]
    source_type: Source = "COMPANY_ACTUAL"
    method: Literal["TRADITIONAL", "AI_ASSISTED"] = "TRADITIONAL"
    project_type: Text = "新規開発"
    industry: str = ""
    technology: str = ""
    measurement: Text = "組織標準"
    start: date | None = None
    end: date | None = None
    duration_months: Positive | None = None
    excluded: bool = False
    exclusion_reason: str = ""
    notes: Annotated[str, Field(max_length=5000)] = ""

    @model_validator(mode="after")
    def coherent(self):
        if self.actual_effort <= self.fixed_effort:
            raise ValueError("実績工数は固定工数より大きくしてください。")
        if self.excluded and not self.exclusion_reason.strip():
            raise ValueError("除外理由が必要です。")
        if self.start and self.end and self.end < self.start:
            raise ValueError("終了日は開始日以降にしてください。")
        return self


class Simulation(Record):
    trials: Annotated[int, Field(ge=1000, le=100000, strict=True)] = 10000
    seed: Annotated[int, Field(ge=0, le=4294967295, strict=True)] = 42


class CalibrationInput(Simulation):
    name: Text
    driver_version: Text
    project_ids: Annotated[list[Text], Field(min_length=3, max_length=1000)]
    method: Literal["TRADITIONAL", "AI_ASSISTED"] = "TRADITIONAL"
    scope_notes: str = ""


class Pricing(Record):
    unit_cost: NonNegative = 1000000
    management_cost: NonNegative = 0
    infrastructure_cost: NonNegative = 0
    contingency: NonNegative = 0
    target_margin: Annotated[float, Field(ge=0, lt=1, allow_inf_nan=False)] = 0.25


class EstimateInput(Simulation):
    name: Text
    model_id: Text
    size: Positive
    size_unit: Text
    fixed_effort: NonNegative = 0
    levels: dict[str, Level]
    pricing: Pricing = Field(default_factory=Pricing)
    project_type: Text = "新規開発"
    industry: str = ""
    technology: str = ""
    method: Literal["TRADITIONAL", "AI_ASSISTED", "AI_FIRST"] = "TRADITIONAL"
    size_notes: Annotated[str, Field(max_length=5000)] = ""


class Phase(Record):
    name: Text
    weight: Rate
    adoption: Rate = 0
    improvement: Rate = 0
    review: Rate = 0
    rework: Rate = 0
    fixed: NonNegative = 0


class Scenario(Record):
    name: Text
    category: Literal["Baseline", "Conservative", "Standard", "Aggressive", "Custom"] = "Custom"
    phases: Annotated[list[Phase], Field(min_length=1, max_length=50)]
    phase_source: Literal["MANUAL", "COMPANY_ACTUAL", "PROJECT_TYPE", "IPA_BENCHMARK"] = "MANUAL"
    phase_source_note: Text = "手動設定・未検証の仮説"
    review_basis: Literal["AI_APPLIED", "BASELINE"] = "AI_APPLIED"
    tool_cost: NonNegative = 0
    infrastructure_cost: NonNegative = 0
    other_cost: NonNegative = 0
    investment: NonNegative = 0
    allocation_rule: Text = "案件全額配賦"
    hypothesis: bool = True

    @model_validator(mode="after")
    def allocation(self):
        if abs(sum(p.weight for p in self.phases) - 1) > 1e-8:
            raise ValueError("工程比率の合計は 100% にしてください。")
        if len({p.name for p in self.phases}) != len(self.phases):
            raise ValueError("工程名が重複しています。")
        if self.category == "Baseline" and (
            any(p.adoption or p.fixed or p.review or p.rework for p in self.phases)
            or self.tool_cost
            or self.infrastructure_cost
            or self.other_cost
            or self.investment
        ):
            raise ValueError("Baseline は AI 効果・追加費用を 0 にしてください。")
        return self


class AIActual(Record):
    project_id: Text
    scenario_id: Text
    estimate_id: Text
    tools: Text
    phase: Text
    adoption: Rate
    usage_hours: NonNegative
    actual_effort: Positive
    review_effort: NonNegative
    rework_effort: NonNegative
    tool_cost: NonNegative
    defects: Annotated[int, Field(ge=0, strict=True)]
    notes: str = ""

    @model_validator(mode="after")
    def effort_parts(self):
        if self.review_effort + self.rework_effort > self.actual_effort:
            raise ValueError("レビュー・手戻り工数は実績工程工数の内数です。")
        return self
