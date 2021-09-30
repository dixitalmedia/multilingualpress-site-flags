<?php

use Inpsyde\MultilingualPress\Framework\Service\ServiceProvider as ServiceProviderInterface;
use Inpsyde\MultilingualPress\Flags\ServiceProvider;

return function (): ServiceProviderInterface
{
    return new ServiceProvider();
};
