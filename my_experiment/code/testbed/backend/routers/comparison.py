"""Comparison endpoints: before/after metric comparison."""

from fastapi import APIRouter, Query
from services.log_collector import load_comparison_data, load_comparison_charts

router = APIRouter()


@router.get("/metrics")
async def get_metrics(baseline: str = Query(...), compare: str = Query(...)):
    return load_comparison_data(baseline, compare)


@router.get("/charts")
async def get_charts(baseline: str = Query(...), compare: str = Query(...)):
    return load_comparison_charts(baseline, compare)
