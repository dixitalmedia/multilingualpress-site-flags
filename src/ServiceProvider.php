<?php # -*- coding: utf-8 -*-
/*
 * This file is part of the MultilingualPress Site Flag package.
 *
 * (c) Inpsyde GmbH
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

declare(strict_types=1);

namespace Inpsyde\MultilingualPress\Flags;

use Inpsyde\MultilingualPress\Flags\Core\Admin\SiteSettingsRepository;
use Inpsyde\MultilingualPress\Framework\Module\Module;
use Inpsyde\MultilingualPress\Framework\Module\ModuleManager;
use Inpsyde\MultilingualPress\Framework\Module\ModuleServiceProvider;
use Inpsyde\MultilingualPress\Framework\Service\Container;
use Inpsyde\MultilingualPress\Flags\Flag\Factory as FlagFactory;
use Inpsyde\MultilingualPress\Framework\Service\Exception\NameOverwriteNotAllowed;
use Inpsyde\MultilingualPress\Framework\Service\Exception\WriteAccessOnLockedContainer;
use Inpsyde\MultilingualPress\TranslationUi\Post\TableList;

class ServiceProvider implements ModuleServiceProvider
{
    const MODULE_ID = 'multilingualpress-site-flags';

    /**
     * Registers the module at the module manager.
     *
     * @param ModuleManager $moduleManager
     * @return bool
     * @throws \Inpsyde\MultilingualPress\Framework\Module\Exception\ModuleAlreadyRegistered
     */
    public function registerModule(ModuleManager $moduleManager): bool
    {
        return $moduleManager->register(
            new Module(
                self::MODULE_ID,
                [
                    'description' => $this->description(),
                    'name' => __('MultilingualPress Site Flags', 'multilingualpress'),
                    'active' => false,
                    'disabled' => false,
                ]
            )
        );
    }

    /**
     * Registers the provided services on the given container.
     *
     * @param Container $container
     * @throws NameOverwriteNotAllowed
     * @throws WriteAccessOnLockedContainer
     */
    public function register(Container $container)
    {
        $container->addService(
            FlagFilter::class,
            static function (Container $container): FlagFilter {
                return new FlagFilter(
                    $container[SiteSettingsRepository::class],
                    $container[FlagFactory::class]
                );
            }
        );
    }

    /**
     * @inheritdoc
     */
    public function activateModule(Container $container)
    {
        $flagFilter = $container[FlagFilter::class];

        add_filter('nav_menu_item_title', [$flagFilter, 'navMenuItems'], 10, 2);
        add_filter(
            TableList::FILTER_SITE_LANGUAGE_TAG,
            [$flagFilter, 'tableListPostsRelations'],
            10,
            2
        );
    }

    /**
     * @return mixed
     */
    protected function description()
    {
        return __(
            'Enable Site Flags for MultilingualPress.',
            'multilingualpress'
        );
    }
}
