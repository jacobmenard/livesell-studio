<?php

namespace App\Enums;

enum UserRole: string
{
    case Seller = 'seller';
    case SuperAdmin = 'superadmin';
}
