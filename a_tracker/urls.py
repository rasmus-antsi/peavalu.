from django.urls import path

from . import views

urlpatterns = [
    path("", views.entry_list, name="entry_list"),
    path("uus/", views.entry_form, name="entry_create"),
    path("<int:pk>/", views.entry_form, name="entry_update"),
    path("<int:pk>/kustuta/", views.entry_delete, name="entry_delete"),
]
