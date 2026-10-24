from django.urls import path

from . import views

urlpatterns = [
    path('challenges/', views.ChallengeListView.as_view()),
    path('challenges/mine/', views.MyChallengesView.as_view()),
    path('challenges/<slug:slug>/', views.ChallengeDetailView.as_view()),
    path('challenges/<slug:slug>/enroll/', views.EnrollView.as_view()),
    path('challenges/<slug:slug>/attendance/', views.AttendanceView.as_view()),
    path('challenges/<slug:slug>/leave/', views.LeaveView.as_view()),
]
